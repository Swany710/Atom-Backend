import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { encryptToken, decryptToken } from '../../crypto.util';
import { EmailConnection } from './email-connection.entity';
import {
  EmailMessage,
  MarkEmailResult,
  ReadEmailsResult,
  SendEmailResult,
  TokenResponse,
} from './email-message.types';

interface GmailDraftResponse {
  id?: string;
}

interface GmailSendResponse {
  id?: string;
}

interface GmailMessageListResponse {
  messages?: Array<{ id: string }>;
}

interface GmailMessageDetailResponse {
  id?: string;
  threadId?: string;
  snippet?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
}

/**
 * GmailLegacyTransport — raw-REST Gmail operations used by EmailService's
 * provider routing when a user's active connection is Gmail.
 *
 * Extracted verbatim from the old 880-line email.service.ts; behavior is
 * unchanged. NOTE: the primary Gmail implementation is GmailService
 * (gmail.service.ts, googleapis + encrypted tokens) — this legacy path
 * exists only for the EmailService router and should eventually be folded
 * into GmailService.
 */
@Injectable()
export class GmailLegacyTransport {
  private readonly logger = new Logger(GmailLegacyTransport.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(EmailConnection)
    private readonly connectionRepo: Repository<EmailConnection>,
  ) {}

  async send(
    userId: string | undefined,
    to: string[],
    subject: string,
    body: string,
    draftOnly: boolean,
    cc?: string[],
    bcc?: string[],
    html?: string,
  ): Promise<SendEmailResult> {
    const connection = await this.getConnection(userId);
    const accessToken = await this.ensureToken(connection);

    const headersList = [
      `From: ${connection.emailAddress || 'me'}`,
      `To: ${to.join(', ')}`,
      cc?.length ? `Cc: ${cc.join(', ')}` : null,
      bcc?.length ? `Bcc: ${bcc.join(', ')}` : null,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      html ? 'Content-Type: text/html; charset="UTF-8"' : 'Content-Type: text/plain; charset="UTF-8"',
    ].filter(Boolean);

    const message = `${headersList.join('\r\n')}\r\n\r\n${html || body}`;
    const raw = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    if (draftOnly) {
      const response = await axios.post<GmailDraftResponse>(
        'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
        { message: { raw } },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      return {
        success: true,
        draftId: response.data?.id,
        message: 'Draft created successfully',
      };
    }

    const response = await axios.post<GmailSendResponse>(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      { raw },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    return {
      success: true,
      messageId: response.data?.id,
      message: `Email sent successfully to ${to.join(', ')}`,
    };
  }

  async read(
    userId: string | undefined,
    maxResults: number,
    query?: string,
    unreadOnly: boolean = false,
  ): Promise<ReadEmailsResult> {
    const connection = await this.getConnection(userId);
    const accessToken = await this.ensureToken(connection);

    const qParts: string[] = [];
    if (query) {
      qParts.push(query);
    }
    if (unreadOnly) {
      qParts.push('is:unread');
    }

    const listResponse = await axios.get<GmailMessageListResponse>(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          maxResults,
          q: qParts.length ? qParts.join(' ') : undefined,
        },
      },
    );

    const messages = listResponse.data?.messages || [];
    const emails: EmailMessage[] = [];

    for (const message of messages) {
      const detailResponse = await axios.get<GmailMessageDetailResponse>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { format: 'metadata', metadataHeaders: ['Subject', 'From', 'To', 'Cc', 'Date'] },
        },
      );

      const payload = detailResponse.data?.payload;
      const headers = payload?.headers || [];

      const headerValue = (name: string): string | undefined =>
        headers.find((header: any) => header.name === name)?.value;

      emails.push({
        id: detailResponse.data?.id,
        threadId: detailResponse.data?.threadId,
        from: headerValue('From'),
        to: headerValue('To') ? headerValue('To').split(',').map((item: string) => item.trim()) : [],
        cc: headerValue('Cc') ? headerValue('Cc').split(',').map((item: string) => item.trim()) : [],
        subject: headerValue('Subject') || '',
        body: detailResponse.data?.snippet || '',
        snippet: detailResponse.data?.snippet,
        date: headerValue('Date'),
      });
    }

    return {
      success: true,
      emails,
      count: emails.length,
      message: `Retrieved ${emails.length} email(s)`,
    };
  }

  async mark(
    userId: string | undefined,
    messageId: string,
    markAsRead: boolean,
  ): Promise<MarkEmailResult> {
    try {
      const connection = await this.getConnection(userId);
      const accessToken = await this.ensureToken(connection);
      const removeLabelIds = markAsRead ? ['UNREAD'] : [];
      const addLabelIds = markAsRead ? [] : ['UNREAD'];

      await axios.post(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
        { addLabelIds, removeLabelIds },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      return {
        success: true,
        message: `Email marked as ${markAsRead ? 'read' : 'unread'}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to modify Gmail message',
      };
    }
  }

  async delete(
    userId: string | undefined,
    messageId: string,
    permanent: boolean,
  ): Promise<MarkEmailResult> {
    try {
      const connection = await this.getConnection(userId);
      const accessToken = await this.ensureToken(connection);

      if (permanent) {
        await axios.delete(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
      } else {
        await axios.post(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`,
          {},
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
      }

      return {
        success: true,
        message: permanent ? 'Email permanently deleted' : 'Email moved to trash',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to delete Gmail message',
      };
    }
  }

  // ── Auth helpers ───────────────────────────────────────────────────────────

  private async getConnection(userId?: string): Promise<EmailConnection> {
    if (!userId) {
      throw new Error('userId is required for Gmail operations.');
    }

    const connection = await this.connectionRepo.findOne({
      where: { userId, provider: 'gmail' },
    });

    if (!connection) {
      throw new Error('Gmail is not connected for this user.');
    }

    return connection;
  }

  private async ensureToken(connection: EmailConnection): Promise<string> {
    // Tokens are stored AES-encrypted by EmailOAuthService (enc:v1: prefix).
    // decryptToken() transparently passes through legacy plaintext rows.
    const accessPlain = connection.accessToken
      ? decryptToken(connection.accessToken)
      : undefined;

    if (
      accessPlain &&
      (!connection.expiresAt ||
        connection.expiresAt.getTime() > Date.now() + 60_000)
    ) {
      return accessPlain;
    }

    const refreshPlain = connection.refreshToken
      ? decryptToken(connection.refreshToken)
      : undefined;

    if (!refreshPlain) {
      throw new Error('Gmail access expired. Please reconnect Gmail.');
    }

    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth is not configured.');
    }

    const tokenResponse = await axios.post<TokenResponse>(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshPlain,
        grant_type: 'refresh_token',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, expires_in } = tokenResponse.data;

    // Re-encrypt before persisting — the DB must never hold plaintext tokens.
    connection.accessToken = encryptToken(access_token);
    connection.expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : undefined;
    await this.connectionRepo.save(connection);

    return access_token;
  }
}
