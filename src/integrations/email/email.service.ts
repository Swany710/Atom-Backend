import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import 'isomorphic-fetch';
import { EmailConnection } from './email-connection.entity';
import { EmailProvider } from './email.types';

export interface EmailMessage {
  id?: string;
  from?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  html?: string;
  threadId?: string;
  date?: string;
  snippet?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  message?: string;
  draftId?: string;
  error?: string;
}

export interface ReadEmailsResult {
  success: boolean;
  emails?: EmailMessage[];
  count?: number;
  message?: string;
  error?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

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

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private graphClient: Client;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(EmailConnection)
    private readonly connectionRepo: Repository<EmailConnection>,
  ) {
    this.initializeMicrosoftGraph();
  }

  /**
   * Initialize Microsoft Graph API client
   */
  private initializeMicrosoftGraph() {
    try {
      const tenantId = this.config.get<string>('MICROSOFT_TENANT_ID');
      const clientId = this.config.get<string>('MICROSOFT_CLIENT_ID');
      const clientSecret = this.config.get<string>('MICROSOFT_CLIENT_SECRET');

      if (!tenantId || !clientId || !clientSecret) {
        this.logger.warn('Microsoft Outlook credentials not configured. Email features will be disabled.');
        return;
      }

      // Create credential for app-only authentication
      const credential = new ClientSecretCredential(
        tenantId,
        clientId,
        clientSecret
      );

      // Initialize Graph client
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

  /**
   * Send an email or create a draft
   */
  async sendEmail(
    to: string[],
    subject: string,
    body: string,
    draftOnly: boolean = false,
    cc?: string[],
    bcc?: string[],
    html?: string,
    userId?: string,
    provider?: EmailProvider,
  ): Promise<SendEmailResult> {
    try {
      const resolvedProvider = await this.resolveProvider(userId, provider);

      if (resolvedProvider === 'gmail') {
        return this.sendGmail(
          userId,
          to,
          subject,
          body,
          draftOnly,
          cc,
          bcc,
          html,
        );
      }

      return this.sendOutlook(
        userId,
        to,
        subject,
        body,
        draftOnly,
        cc,
        bcc,
        html,
      );
    } catch (error) {
      this.logger.error('Error sending email:', error);
      return {
        success: false,
        error: error.message || 'Failed to send email',
      };
    }
  }

  /**
   * Read recent emails
   */
  async readEmails(
    maxResults: number = 10,
    query?: string,
    unreadOnly: boolean = false,
    userId?: string,
    provider?: EmailProvider,
  ): Promise<ReadEmailsResult> {
    try {
      const resolvedProvider = await this.resolveProvider(userId, provider);
      this.logger.log(`Reading emails (provider: ${resolvedProvider})`);

      if (resolvedProvider === 'gmail') {
        return this.readGmailEmails(userId, maxResults, query, unreadOnly);
      }

      return this.readOutlookEmails(userId, maxResults, query, unreadOnly);
    } catch (error) {
      this.logger.error('Error reading emails:', error);
      return {
        success: false,
        error: error.message || 'Failed to read emails',
      };
    }
  }

  /**
   * Reply to an email
   */
  async replyToEmail(
    messageId: string,
    replyBody: string,
    replyAll: boolean = false,
    userId?: string,
    provider?: EmailProvider,
  ): Promise<SendEmailResult> {
    try {
      const resolvedProvider = await this.resolveProvider(userId, provider);

      if (resolvedProvider === 'gmail') {
        return {
          success: false,
          error: 'Gmail reply is not implemented yet. Please send a new email instead.',
        };
      }

      this.logger.log(`Replying to message: ${messageId}`);
      const graphClient = await this.getOutlookClient(userId);
      const userPrincipalName = await this.getOutlookUserPrincipalName(userId);
      const reply = { comment: replyBody };
      const endpoint = replyAll ? 'replyAll' : 'reply';

      await graphClient
        .api(`/users/${userPrincipalName}/messages/${messageId}/${endpoint}`)
        .post(reply);

      return { success: true, message: 'Reply sent successfully' };
    } catch (error) {
      this.logger.error('Error replying to email:', error);
      return {
        success: false,
        error: error.message || 'Failed to send reply',
      };
    }
  }

  /**
   * Mark email as read/unread
   */
  async markEmail(
    messageId: string,
    markAsRead: boolean = true,
    userId?: string,
    provider?: EmailProvider,
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const resolvedProvider = await this.resolveProvider(userId, provider);
      if (resolvedProvider === 'gmail') {
        return this.modifyGmailMessage(userId, messageId, markAsRead);
      }

      const graphClient = await this.getOutlookClient(userId);
      const userPrincipalName = await this.getOutlookUserPrincipalName(userId);

      await graphClient
        .api(`/users/${userPrincipalName}/messages/${messageId}`)
        .patch({
          isRead: markAsRead,
        });

      return {
        success: true,
        message: `Email marked as ${markAsRead ? 'read' : 'unread'}`,
      };
    } catch (error) {
      this.logger.error('Error marking email:', error);
      return {
        success: false,
        error: error.message || 'Failed to mark email',
      };
    }
  }

  /**
   * Delete an email
   */
  async deleteEmail(
    messageId: string,
    permanent: boolean = false,
    userId?: string,
    provider?: EmailProvider,
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const resolvedProvider = await this.resolveProvider(userId, provider);

      if (resolvedProvider === 'gmail') {
        return this.deleteGmailMessage(userId, messageId, permanent);
      }

      const graphClient = await this.getOutlookClient(userId);
      const userPrincipalName = await this.getOutlookUserPrincipalName(userId);

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
    } catch (error) {
      this.logger.error('Error deleting email:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete email',
      };
    }
  }

  /**
   * Forward an email
   */
  async forwardEmail(
    messageId: string,
    toRecipients: string[],
    comment?: string,
    userId?: string,
    provider?: EmailProvider,
  ): Promise<SendEmailResult> {
    try {
      const resolvedProvider = await this.resolveProvider(userId, provider);

      if (resolvedProvider === 'gmail') {
        return {
          success: false,
          error: 'Gmail forward is not implemented yet. Please send a new email instead.',
        };
      }

      this.logger.log(`Forwarding message ${messageId} to ${toRecipients.join(', ')}`);
      const graphClient = await this.getOutlookClient(userId);
      const userPrincipalName = await this.getOutlookUserPrincipalName(userId);

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
    } catch (error) {
      this.logger.error('Error forwarding email:', error);
      return {
        success: false,
        error: error.message || 'Failed to forward email',
      };
    }
  }

  /**
   * Search emails
   */
  async searchEmails(
    searchQuery: string,
    maxResults: number = 20,
    userId?: string,
    provider?: EmailProvider,
  ): Promise<ReadEmailsResult> {
    try {
      const resolvedProvider = await this.resolveProvider(userId, provider);
      this.logger.log(`Searching emails: ${searchQuery}`);

      if (resolvedProvider === 'gmail') {
        return this.readGmailEmails(userId, maxResults, searchQuery, false);
      }

      const graphClient = await this.getOutlookClient(userId);
      const userPrincipalName = await this.getOutlookUserPrincipalName(userId);

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
    } catch (error) {
      this.logger.error('Error searching emails:', error);
      return {
        success: false,
        error: error.message || 'Failed to search emails',
      };
    }
  }

  private async resolveProvider(
    userId?: string,
    provider?: EmailProvider,
  ): Promise<EmailProvider> {
    if (provider) {
      return provider;
    }

    if (!userId) {
      return 'outlook';
    }

    const connection = await this.connectionRepo.findOne({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });

    return connection?.provider || 'outlook';
  }

  private async sendOutlook(
    userId: string | undefined,
    to: string[],
    subject: string,
    body: string,
    draftOnly: boolean,
    cc?: string[],
    bcc?: string[],
    html?: string,
  ): Promise<SendEmailResult> {
    const graphClient = await this.getOutlookClient(userId);
    const userPrincipalName = await this.getOutlookUserPrincipalName(userId);

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

  private async readOutlookEmails(
    userId: string | undefined,
    maxResults: number,
    query?: string,
    unreadOnly: boolean = false,
  ): Promise<ReadEmailsResult> {
    const graphClient = await this.getOutlookClient(userId);
    const userPrincipalName = await this.getOutlookUserPrincipalName(userId);

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

  private async sendGmail(
    userId: string | undefined,
    to: string[],
    subject: string,
    body: string,
    draftOnly: boolean,
    cc?: string[],
    bcc?: string[],
    html?: string,
  ): Promise<SendEmailResult> {
    const connection = await this.getGmailConnection(userId);
    const accessToken = await this.ensureGmailToken(connection);

    const headers = [
      `From: ${connection.emailAddress || 'me'}`,
      `To: ${to.join(', ')}`,
      cc?.length ? `Cc: ${cc.join(', ')}` : null,
      bcc?.length ? `Bcc: ${bcc.join(', ')}` : null,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      html ? 'Content-Type: text/html; charset="UTF-8"' : 'Content-Type: text/plain; charset="UTF-8"',
    ].filter(Boolean);

    const message = `${headers.join('\r\n')}\r\n\r\n${html || body}`;
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

  private async readGmailEmails(
    userId: string | undefined,
    maxResults: number,
    query?: string,
    unreadOnly: boolean = false,
  ): Promise<ReadEmailsResult> {
    const connection = await this.getGmailConnection(userId);
    const accessToken = await this.ensureGmailToken(connection);

    const qParts = [];
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

      const headerValue = (name: string) =>
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

  private async modifyGmailMessage(
    userId: string | undefined,
    messageId: string,
    markAsRead: boolean,
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const connection = await this.getGmailConnection(userId);
      const accessToken = await this.ensureGmailToken(connection);
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
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to modify Gmail message',
      };
    }
  }

  private async deleteGmailMessage(
    userId: string | undefined,
    messageId: string,
    permanent: boolean,
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const connection = await this.getGmailConnection(userId);
      const accessToken = await this.ensureGmailToken(connection);

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
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to delete Gmail message',
      };
    }
  }

  private async getOutlookClient(userId?: string): Promise<Client> {
    const connection = userId
      ? await this.connectionRepo.findOne({ where: { userId, provider: 'outlook' } })
      : null;

    if (connection) {
      const accessToken = await this.ensureOutlookToken(connection);
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

  private async getOutlookUserPrincipalName(userId?: string): Promise<string> {
    const connection = userId
      ? await this.connectionRepo.findOne({ where: { userId, provider: 'outlook' } })
      : null;

    return (
      connection?.emailAddress ||
      userId ||
      this.config.get<string>('MICROSOFT_USER_EMAIL')
    );
  }

  private async getGmailConnection(userId?: string): Promise<EmailConnection> {
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

  private async ensureGmailToken(connection: EmailConnection): Promise<string> {
    if (
      connection.accessToken &&
      (!connection.expiresAt ||
        connection.expiresAt.getTime() > Date.now() + 60_000)
    ) {
      return connection.accessToken;
    }

    if (!connection.refreshToken) {
      throw new Error('Gmail access expired. Please reconnect Gmail.');
    }

    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth is not configured.');
    }

    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: connection.refreshToken,
        grant_type: 'refresh_token',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, expires_in } = tokenResponse.data as TokenResponse;

    connection.accessToken = access_token;
    connection.expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : undefined;
    await this.connectionRepo.save(connection);

    return access_token;
  }

  private async ensureOutlookToken(connection: EmailConnection): Promise<string> {
    if (
      connection.accessToken &&
      (!connection.expiresAt ||
        connection.expiresAt.getTime() > Date.now() + 60_000)
    ) {
      return connection.accessToken;
    }

    if (!connection.refreshToken) {
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
        refresh_token: connection.refreshToken,
        grant_type: 'refresh_token',
        redirect_uri: redirectUri,
        scope,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    connection.accessToken = access_token;
    if (refresh_token) {
      connection.refreshToken = refresh_token;
    }
    connection.expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : undefined;
    await this.connectionRepo.save(connection);

    return access_token;
  }
}
