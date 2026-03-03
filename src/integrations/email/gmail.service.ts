import { Injectable, Logger } from '@nestjs/common';
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
          refresh_token: conn.refreshToken,
          access_token:  conn.accessToken,
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
