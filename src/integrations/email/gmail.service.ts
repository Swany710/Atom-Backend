import { Injectable, Logger } from '@nestjs/common';
import { decryptToken } from '../../crypto.util';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google } from 'googleapis';
import * as path from 'path';
import * as os from 'os';
import { writeFile, unlink } from 'fs/promises';
import { createReadStream } from 'fs';
import { EmailConnection } from './email-connection.entity';

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  // Env-var-backed OAuth client (legacy / fallback path)
  private readonly envOauth2Client: any;
  private readonly envUserEmail: string | undefined;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(EmailConnection)
    private readonly connectionRepo: Repository<EmailConnection>,
  ) {
    const clientId     = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri  = this.config.get<string>('GOOGLE_REDIRECT_URI');
    this.envUserEmail  = this.config.get<string>('GOOGLE_USER_EMAIL');

    if (clientId && clientSecret && redirectUri) {
      this.envOauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

      const refreshToken = this.config.get<string>('GOOGLE_REFRESH_TOKEN');
      if (refreshToken) {
        this.envOauth2Client.setCredentials({ refresh_token: refreshToken });
      }
    } else {
      this.logger.warn(
        'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI not set — ' +
        'Gmail will use DB-stored OAuth tokens only.',
      );
    }
  }

  // ── Auth resolution ───────────────────────────────────────────────────────
  // Priority: DB-stored tokens (from the settings connect-flow) → env var tokens.
  private async resolveAuth(userId = 'default-user'): Promise<{ client: any; fromEmail: string }> {
    // 1. Try DB-stored OAuth connection
    const conn = await this.connectionRepo.findOne({
      where: { userId, provider: 'gmail' },
    });

    if (conn?.refreshToken) {
      const clientId     = this.config.get<string>('GOOGLE_CLIENT_ID');
      const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
      const redirectUri  = this.config.get<string>('GOOGLE_REDIRECT_URI');

      if (clientId && clientSecret) {
        const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
        client.setCredentials({
          refresh_token: conn.refreshToken ? decryptToken(conn.refreshToken) : undefined,
          access_token:  decryptToken(conn.accessToken),
        });
        const fromEmail = conn.emailAddress ?? this.envUserEmail ?? '';
        this.logger.log(`Using DB OAuth tokens for user ${userId} (${fromEmail})`);
        return { client, fromEmail };
      }
    }

    // 2. Fall back to env var tokens
    if (this.envOauth2Client) {
      const fromEmail = this.envUserEmail ?? '';
      this.logger.log(`Using env-var OAuth tokens (${fromEmail})`);
      return { client: this.envOauth2Client, fromEmail };
    }

    throw new Error(
      'Gmail is not connected. Open Atom Settings, click "Connect Gmail", and sign in with Google.',
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private gmailClient(auth: any) {
    return google.gmail({ version: 'v1', auth });
  }

  private buildRaw(
    from: string,
    to: string[],
    subject: string,
    body: string,
    html?: string,
    cc?: string[],
    bcc?: string[],
  ): string {
    const lines: string[] = [
      `From: ${from}`,
      `To: ${to.join(', ')}`,
      ...(cc?.length  ? [`Cc: ${cc.join(', ')}`]  : []),
      ...(bcc?.length ? [`Bcc: ${bcc.join(', ')}`] : []),
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      html
        ? 'Content-Type: text/html; charset=UTF-8'
        : 'Content-Type: text/plain; charset=UTF-8',
      '',
      html ?? body,
    ];

    return Buffer.from(lines.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // ── Public API ────────────────────────────────────────────────────────────
  async sendEmail(
    to: string[],
    subject: string,
    body: string,
    draftOnly = false,
    cc?: string[],
    bcc?: string[],
    html?: string,
    userId = 'default-user',
  ) {
    const { client, fromEmail } = await this.resolveAuth(userId);
    if (!fromEmail) {
      throw new Error(
        'No "from" email address configured. Enter your Gmail address in Atom Settings.',
      );
    }

    const raw    = this.buildRaw(fromEmail, to, subject, body, html, cc, bcc);
    const gmail  = this.gmailClient(client);

    if (draftOnly) {
      const res = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: { message: { raw } },
      });
      return { draftId: res.data?.id };
    }

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
    return { messageId: res.data?.id };
  }

  async readEmails(
    maxResults = 10,
    query?: string,
    unreadOnly = false,
    userId = 'default-user',
  ) {
    const { client } = await this.resolveAuth(userId);
    const gmail = this.gmailClient(client);

    const q = [query, unreadOnly ? 'is:unread' : ''].filter(Boolean).join(' ').trim();

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: q || undefined,
    });

    const messages = listRes.data?.messages ?? [];
    const detailed = await Promise.all(
      messages.map(async (m) => {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: m.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date'],
        });

        const headers   = detail.data?.payload?.headers ?? [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value;

        return {
          id:       detail.data?.id,
          threadId: detail.data?.threadId,
          from:     getHeader('From'),
          to:       getHeader('To'),
          subject:  getHeader('Subject'),
          date:     getHeader('Date'),
          snippet:  detail.data?.snippet,
        };
      }),
    );

    return { messages: detailed };
  }

  async replyToEmail(
    messageId: string,
    body: string,
    replyAll = false,
    userId = 'default-user',
  ) {
    const { client, fromEmail } = await this.resolveAuth(userId);
    if (!fromEmail) throw new Error('No "from" email address configured.');

    const gmail = this.gmailClient(client);
    const msg   = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Message-ID', 'References'],
    });

    const headers    = msg.data?.payload?.headers ?? [];
    const subject    = headers.find((h) => h.name === 'Subject')?.value ?? '';
    const inReplyTo  = headers.find((h) => h.name === 'Message-ID')?.value;
    const refs       = headers.find((h) => h.name === 'References')?.value;
    const toHeader   =
      headers.find((h) => h.name === 'Reply-To')?.value ||
      headers.find((h) => h.name === 'From')?.value;

    if (!toHeader) throw new Error('Unable to determine reply recipient');

    const toEmail =
      toHeader.includes('<')
        ? toHeader.split('<')[1].split('>')[0].trim()
        : toHeader.trim();

    const finalSubject = subject.toLowerCase().startsWith('re:')
      ? subject
      : `Re: ${subject}`;

    const lines = [
      `From: ${fromEmail}`,
      `To: ${toEmail}`,
      `Subject: ${finalSubject}`,
      ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`] : []),
      ...(refs ? [`References: ${refs}`] : []),
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      body,
    ];

    const raw = Buffer.from(lines.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw, threadId: msg.data?.threadId ?? undefined },
    });

    return { messageId: res.data?.id, threadId: res.data?.threadId };
  }


  /** Get a single email with full body text */
  async getEmail(messageId: string, userId = 'default-user') {
    const { client } = await this.resolveAuth(userId);
    const gmail = this.gmailClient(client);
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const headers = msg.data?.payload?.headers ?? [];
    const getH = (n: string) => headers.find(h => h.name?.toLowerCase() === n.toLowerCase())?.value;

    const extractBody = (payload: any): string => {
      if (!payload) return '';
      if (payload.body?.data) return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
      if (payload.parts) {
        const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
        const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
        const part = textPart ?? htmlPart;
        if (part?.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf-8');
        for (const p of payload.parts) {
          const nested = extractBody(p);
          if (nested) return nested;
        }
      }
      return '';
    };

    return {
      id:        msg.data?.id,
      threadId:  msg.data?.threadId,
      from:      getH('From'),
      to:        getH('To'),
      cc:        getH('Cc'),
      subject:   getH('Subject'),
      date:      getH('Date'),
      snippet:   msg.data?.snippet,
      body:      extractBody(msg.data?.payload),
      labelIds:  msg.data?.labelIds ?? [],
      unread:    (msg.data?.labelIds ?? []).includes('UNREAD'),
    };
  }

  /** Get a full email thread */
  async getThread(threadId: string, userId = 'default-user') {
    const { client } = await this.resolveAuth(userId);
    const gmail = this.gmailClient(client);
    const thread = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Date'],
    });
    const messages = (thread.data?.messages ?? []).map(m => {
      const headers = m.payload?.headers ?? [];
      const getH = (n: string) => headers.find(h => h.name?.toLowerCase() === n.toLowerCase())?.value;
      return {
        id:       m.id,
        from:     getH('From'),
        to:       getH('To'),
        date:     getH('Date'),
        snippet:  m.snippet,
        unread:   (m.labelIds ?? []).includes('UNREAD'),
      };
    });
    return { threadId, subject: messages[0] ? undefined : '', messages };
  }

  /** Search emails with a Gmail query string */
  async searchEmails(query: string, maxResults = 20, userId = 'default-user') {
    return this.readEmails(maxResults, query, false, userId);
  }

  /** Move a message to trash */
  async deleteEmail(messageId: string, userId = 'default-user') {
    const { client } = await this.resolveAuth(userId);
    const gmail = this.gmailClient(client);
    await gmail.users.messages.trash({ userId: 'me', id: messageId });
    return { success: true, messageId, action: 'trashed' };
  }

  /** Archive (remove INBOX label, keep in All Mail) */
  async archiveEmail(messageId: string, userId = 'default-user') {
    const { client } = await this.resolveAuth(userId);
    const gmail = this.gmailClient(client);
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { removeLabelIds: ['INBOX'] },
    });
    return { success: true, messageId, action: 'archived' };
  }

  /** Mark a message as read or unread */
  async markRead(messageId: string, read: boolean, userId = 'default-user') {
    const { client } = await this.resolveAuth(userId);
    const gmail = this.gmailClient(client);
    const body = read
      ? { removeLabelIds: ['UNREAD'] }
      : { addLabelIds: ['UNREAD'] };
    await gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody: body });
    return { success: true, messageId, read };
  }

  /** Move message to a label/folder */
  async moveEmail(messageId: string, addLabelIds: string[], removeLabelIds: string[], userId = 'default-user') {
    const { client } = await this.resolveAuth(userId);
    const gmail = this.gmailClient(client);
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { addLabelIds, removeLabelIds },
    });
    return { success: true, messageId };
  }

  /** List available Gmail labels/folders */
  async listLabels(userId = 'default-user') {
    const { client } = await this.resolveAuth(userId);
    const gmail = this.gmailClient(client);
    const res = await gmail.users.labels.list({ userId: 'me' });
    return (res.data.labels ?? []).map(l => ({ id: l.id, name: l.name, type: l.type }));
  }


  // ── Status helper used by settings endpoint ───────────────────────────────
  async getConnectionStatus(userId = 'default-user'): Promise<{
    connected: boolean;
    emailAddress?: string;
    source: 'database' | 'env_vars' | 'none';
  }> {
    const conn = await this.connectionRepo.findOne({
      where: { userId, provider: 'gmail' },
    });

    if (conn?.refreshToken) {
      return { connected: true, emailAddress: conn.emailAddress, source: 'database' };
    }

    if (this.envOauth2Client && this.config.get<string>('GOOGLE_REFRESH_TOKEN')) {
      return { connected: true, emailAddress: this.envUserEmail, source: 'env_vars' };
    }

    return { connected: false, source: 'none' };
  }
}
