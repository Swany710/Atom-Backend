import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

@Injectable()
export class GmailService {
  private readonly oauth2Client;

  constructor(private readonly config: ConfigService) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        'Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI env vars',
      );
    }

    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    // If you're using refresh-token mode initially:
    const refreshToken = this.config.get<string>('GOOGLE_REFRESH_TOKEN');
    if (refreshToken) {
      this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    }
  }

  private gmail() {
    return google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  async sendEmail(
    to: string[],
    subject: string,
    body: string,
    draftOnly = false,
    cc?: string[],
    bcc?: string[],
    html?: string,
  ) {
    const from = this.config.get<string>('GOOGLE_USER_EMAIL');
    if (!from) throw new Error('Missing GOOGLE_USER_EMAIL env var');

    const headers: string[] = [
      `From: ${from}`,
      `To: ${to.join(', ')}`,
      cc?.length ? `Cc: ${cc.join(', ')}` : '',
      bcc?.length ? `Bcc: ${bcc.join(', ')}` : '',
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      html ? 'Content-Type: text/html; charset=UTF-8' : 'Content-Type: text/plain; charset=UTF-8',
      '',
      html ?? body,
    ].filter(Boolean);

    const raw = Buffer.from(headers.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    if (draftOnly) {
      const res = await this.gmail().users.drafts.create({
        userId: 'me',
        requestBody: { message: { raw } },
      });
      return { draftId: res.data?.id };
    }

    const res = await this.gmail().users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    return { messageId: res.data?.id };
  }

  async readEmails(maxResults = 10, query?: string, unreadOnly = false) {
    const q = [query, unreadOnly ? 'is:unread' : ''].filter(Boolean).join(' ').trim();

    const listRes = await this.gmail().users.messages.list({
      userId: 'me',
      maxResults,
      q: q || undefined,
    });

    const messages = listRes.data?.messages ?? [];
    const detailed = await Promise.all(
      messages.map(async (m) => {
        const detail = await this.gmail().users.messages.get({
          userId: 'me',
          id: m.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date'],
        });

        const headers = detail.data?.payload?.headers ?? [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value;

        return {
          id: detail.data?.id,
          threadId: detail.data?.threadId,
          from: getHeader('From'),
          to: getHeader('To'),
          subject: getHeader('Subject'),
          date: getHeader('Date'),
          snippet: detail.data?.snippet,
        };
      }),
    );

    return { messages: detailed };
  }

  async replyToEmail(messageId: string, body: string, replyAll = false) {
    // Minimal “works now” implementation: just sends a new message with `In-Reply-To`.
    // (Threading can be improved later by fetching headers + threadId)
    const msg = await this.gmail().users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Message-ID', 'References'],
    });

    const headers = msg.data?.payload?.headers ?? [];
    const subject = headers.find((h) => h.name === 'Subject')?.value ?? '';
    const inReplyTo = headers.find((h) => h.name === 'Message-ID')?.value;
    const refs = headers.find((h) => h.name === 'References')?.value;

    const toHeader = headers.find((h) => h.name === 'Reply-To')?.value
      || headers.find((h) => h.name === 'From')?.value;

    if (!toHeader) throw new Error('Unable to determine reply recipient');

    // crude parse: "Name <email@x.com>" OR "email@x.com"
    const toEmail = toHeader.includes('<')
      ? toHeader.split('<')[1].split('>')[0].trim()
      : toHeader.trim();

    const finalSubject = subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`;

    const from = this.config.get<string>('GOOGLE_USER_EMAIL');
    if (!from) throw new Error('Missing GOOGLE_USER_EMAIL env var');

    const headersOut: string[] = [
      `From: ${from}`,
      `To: ${toEmail}`,
      `Subject: ${finalSubject}`,
      inReplyTo ? `In-Reply-To: ${inReplyTo}` : '',
      refs ? `References: ${refs}` : '',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      body,
    ].filter(Boolean);

    const raw = Buffer.from(headersOut.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await this.gmail().users.messages.send({
      userId: 'me',
      requestBody: { raw, threadId: msg.data?.threadId ?? undefined },
    });

    return { messageId: res.data?.id, threadId: res.data?.threadId };
  }
}
