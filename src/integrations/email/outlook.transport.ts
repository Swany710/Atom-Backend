import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import 'isomorphic-fetch';
import { encryptToken, decryptToken } from '../../crypto.util';
import { EmailConnection } from './email-connection.entity';
import {
  EmailMessage,
  MarkEmailResult,
  ReadEmailsResult,
  SendEmailResult,
  TokenResponse,
} from './email-message.types';

/**
 * OutlookTransport — all Microsoft Graph / Outlook mail operations.
 *
 * Extracted verbatim from the old 880-line email.service.ts. Behavior is
 * unchanged; EmailService now routes provider-agnostic calls here.
 */
@Injectable()
export class OutlookTransport {
  private readonly logger = new Logger(OutlookTransport.name);
  private graphClient: Client;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(EmailConnection)
    private readonly connectionRepo: Repository<EmailConnection>,
  ) {
    this.initializeMicrosoftGraph();
  }

  /** Initialize the app-only Microsoft Graph API client (env-credential fallback). */
  private initializeMicrosoftGraph() {
    try {
      const tenantId = this.config.get<string>('MICROSOFT_TENANT_ID');
      const clientId = this.config.get<string>('MICROSOFT_CLIENT_ID');
      const clientSecret = this.config.get<string>('MICROSOFT_CLIENT_SECRET');

      if (!tenantId || !clientId || !clientSecret) {
        this.logger.warn('Microsoft Outlook credentials not configured. Email features will be disabled.');
        return;
      }

      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

      this.graphClient = Client.initWithMiddleware({
        authProvider: {
          getAccessToken: async () => {
            const token = await credential.getToken('https://graph.microsoft.com/.default');
            return token.token;
          },
        },
      });

      this.logger.log('Microsoft Graph API (Outlook) initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Microsoft Graph API:', error);
    }
  }

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
    const graphClient = await this.getClient(userId);
    const userPrincipalName = await this.getUserPrincipalName(userId);

    const message = {
      subject,
      body: {
        contentType: html ? 'HTML' : 'Text',
        content: html || body,
      },
      toRecipients: to.map(email => ({
        emailAddress: { address: email },
      })),
      ccRecipients: cc?.map(email => ({
        emailAddress: { address: email },
      })) || [],
      bccRecipients: bcc?.map(email => ({
        emailAddress: { address: email },
      })) || [],
    };

    if (draftOnly) {
      const response = await graphClient
        .api(`/users/${userPrincipalName}/messages`)
        .post(message);

      return {
        success: true,
        draftId: response.id,
        message: 'Draft created successfully',
      };
    }

    await graphClient
      .api(`/users/${userPrincipalName}/sendMail`)
      .post({
        message,
        saveToSentItems: true,
      });

    return {
      success: true,
      message: `Email sent successfully to ${to.join(', ')}`,
    };
  }

  async read(
    userId: string | undefined,
    maxResults: number,
    query?: string,
    unreadOnly: boolean = false,
  ): Promise<ReadEmailsResult> {
    const graphClient = await this.getClient(userId);
    const userPrincipalName = await this.getUserPrincipalName(userId);

    let filter = '';
    if (unreadOnly) {
      filter = 'isRead eq false';
    }

    let request = graphClient
      .api(`/users/${userPrincipalName}/messages`)
      .top(maxResults)
      .orderby('receivedDateTime DESC')
      .select('id,subject,from,toRecipients,ccRecipients,bodyPreview,receivedDateTime,conversationId,isRead');

    if (filter) {
      request = request.filter(filter);
    }

    if (query) {
      request = request.search(`"${query}"`);
    }

    const response = await request.get();
    const items = response.value || [];

    const emails: EmailMessage[] = items.map((msg: any) => ({
      id: msg.id,
      threadId: msg.conversationId,
      from: msg.from?.emailAddress?.address,
      to: msg.toRecipients?.map((r: any) => r.emailAddress.address) || [],
      cc: msg.ccRecipients?.map((r: any) => r.emailAddress.address),
      subject: msg.subject,
      body: msg.bodyPreview,
      snippet: msg.bodyPreview,
      date: msg.receivedDateTime,
    }));

    return {
      success: true,
      emails,
      count: emails.length,
      message: `Retrieved ${emails.length} email(s)`,
    };
  }

  async reply(
    userId: string | undefined,
    messageId: string,
    replyBody: string,
    replyAll: boolean,
  ): Promise<SendEmailResult> {
    this.logger.log(`Replying to message: ${messageId}`);
    const graphClient = await this.getClient(userId);
    const userPrincipalName = await this.getUserPrincipalName(userId);
    const reply = { comment: replyBody };
    const endpoint = replyAll ? 'replyAll' : 'reply';

    await graphClient
      .api(`/users/${userPrincipalName}/messages/${messageId}/${endpoint}`)
      .post(reply);

    return { success: true, message: 'Reply sent successfully' };
  }

  async mark(
    userId: string | undefined,
    messageId: string,
    markAsRead: boolean,
  ): Promise<MarkEmailResult> {
    const graphClient = await this.getClient(userId);
    const userPrincipalName = await this.getUserPrincipalName(userId);

    await graphClient
      .api(`/users/${userPrincipalName}/messages/${messageId}`)
      .patch({
        isRead: markAsRead,
      });

    return {
      success: true,
      message: `Email marked as ${markAsRead ? 'read' : 'unread'}`,
    };
  }

  async delete(
    userId: string | undefined,
    messageId: string,
    permanent: boolean,
  ): Promise<MarkEmailResult> {
    const graphClient = await this.getClient(userId);
    const userPrincipalName = await this.getUserPrincipalName(userId);

    if (permanent) {
      await graphClient
        .api(`/users/${userPrincipalName}/messages/${messageId}`)
        .delete();
    } else {
      const deletedItemsFolder = await graphClient
        .api(`/users/${userPrincipalName}/mailFolders/deleteditems`)
        .get();

      await graphClient
        .api(`/users/${userPrincipalName}/messages/${messageId}/move`)
        .post({
          destinationId: deletedItemsFolder.id,
        });
    }

    return {
      success: true,
      message: permanent ? 'Email permanently deleted' : 'Email moved to trash',
    };
  }

  async forward(
    userId: string | undefined,
    messageId: string,
    toRecipients: string[],
    comment?: string,
  ): Promise<SendEmailResult> {
    this.logger.log(`Forwarding message ${messageId} to ${toRecipients.join(', ')}`);
    const graphClient = await this.getClient(userId);
    const userPrincipalName = await this.getUserPrincipalName(userId);

    await graphClient
      .api(`/users/${userPrincipalName}/messages/${messageId}/forward`)
      .post({
        comment: comment || '',
        toRecipients: toRecipients.map(email => ({
          emailAddress: { address: email },
        })),
      });

    return {
      success: true,
      message: `Email forwarded to ${toRecipients.join(', ')}`,
    };
  }

  async search(
    userId: string | undefined,
    searchQuery: string,
    maxResults: number,
  ): Promise<ReadEmailsResult> {
    const graphClient = await this.getClient(userId);
    const userPrincipalName = await this.getUserPrincipalName(userId);

    const response = await graphClient
      .api(`/users/${userPrincipalName}/messages`)
      .search(`"${searchQuery}"`)
      .top(maxResults)
      .select('id,subject,from,toRecipients,bodyPreview,receivedDateTime,conversationId')
      .get();

    const items = response.value || [];

    const emails: EmailMessage[] = items.map((msg: any) => ({
      id: msg.id,
      threadId: msg.conversationId,
      from: msg.from?.emailAddress?.address,
      to: msg.toRecipients?.map((r: any) => r.emailAddress.address) || [],
      subject: msg.subject,
      body: msg.bodyPreview,
      snippet: msg.bodyPreview,
      date: msg.receivedDateTime,
    }));

    return {
      success: true,
      emails,
      count: emails.length,
      message: `Found ${emails.length} matching email(s)`,
    };
  }

  // ── Auth / client helpers ──────────────────────────────────────────────────

  private async getClient(userId?: string): Promise<Client> {
    const connection = userId
      ? await this.connectionRepo.findOne({ where: { userId, provider: 'outlook' } })
      : null;

    if (connection) {
      const accessToken = await this.ensureToken(connection);
      return Client.initWithMiddleware({
        authProvider: {
          getAccessToken: async () => accessToken,
        },
      });
    }

    if (!this.graphClient) {
      throw new Error('Outlook API not initialized. Please configure Microsoft credentials.');
    }

    return this.graphClient;
  }

  private async getUserPrincipalName(userId?: string): Promise<string> {
    const connection = userId
      ? await this.connectionRepo.findOne({ where: { userId, provider: 'outlook' } })
      : null;

    return (
      connection?.emailAddress ||
      userId ||
      this.config.get<string>('MICROSOFT_USER_EMAIL')
    );
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
      throw new Error('Outlook access expired. Please reconnect Outlook.');
    }

    const clientId = this.config.get<string>('MICROSOFT_CLIENT_ID');
    const clientSecret = this.config.get<string>('MICROSOFT_CLIENT_SECRET');
    const tenantId = this.config.get<string>('MICROSOFT_TENANT_ID') || 'common';
    const redirectUri = this.config.get<string>('MICROSOFT_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Microsoft OAuth is not configured.');
    }

    const scope = [
      'offline_access',
      'https://graph.microsoft.com/Mail.ReadWrite',
      'https://graph.microsoft.com/Mail.Send',
      'https://graph.microsoft.com/User.Read',
    ].join(' ');

    const tokenResponse = await axios.post<TokenResponse>(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshPlain,
        grant_type: 'refresh_token',
        redirect_uri: redirectUri,
        scope,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Re-encrypt before persisting — the DB must never hold plaintext tokens.
    connection.accessToken = encryptToken(access_token);
    if (refresh_token) {
      connection.refreshToken = encryptToken(refresh_token);
    }
    connection.expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : undefined;
    await this.connectionRepo.save(connection);

    return access_token;
  }
}
