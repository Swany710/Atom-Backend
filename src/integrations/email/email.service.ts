import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import 'isomorphic-fetch';

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

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private graphClient: Client;

  constructor(private readonly config: ConfigService) {
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
  ): Promise<SendEmailResult> {
    if (!this.graphClient) {
      return {
        success: false,
        error: 'Outlook API not initialized. Please configure Microsoft credentials.',
      };
    }

    try {
      this.logger.log(`${draftOnly ? 'Creating draft' : 'Sending email'} to: ${to.join(', ')}`);

      const userPrincipalName = userId || this.config.get<string>('MICROSOFT_USER_EMAIL');

      // Build email message
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
        // Create draft
        const response = await this.graphClient
          .api(`/users/${userPrincipalName}/messages`)
          .post(message);

        return {
          success: true,
          draftId: response.id,
          message: 'Draft created successfully',
        };
      } else {
        // Send email
        await this.graphClient
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
  ): Promise<ReadEmailsResult> {
    if (!this.graphClient) {
      return {
        success: false,
        error: 'Outlook API not initialized. Please configure Microsoft credentials.',
      };
    }

    try {
      this.logger.log(`Reading emails (max: ${maxResults}, query: ${query || 'none'})`);

      const userPrincipalName = userId || this.config.get<string>('MICROSOFT_USER_EMAIL');

      // Build filter
      let filter = '';
      if (unreadOnly) {
        filter = 'isRead eq false';
      }

      let request = this.graphClient
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

      this.logger.log(`Retrieved ${emails.length} emails`);

      return {
        success: true,
        emails,
        count: emails.length,
        message: `Retrieved ${emails.length} email(s)`,
      };
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
  ): Promise<SendEmailResult> {
    if (!this.graphClient) {
      return {
        success: false,
        error: 'Outlook API not initialized. Please configure Microsoft credentials.',
      };
    }

    try {
      this.logger.log(`Replying to message: ${messageId}`);

      const userPrincipalName = userId || this.config.get<string>('MICROSOFT_USER_EMAIL');

      const reply = {
        comment: replyBody,
      };

      const endpoint = replyAll ? 'replyAll' : 'reply';

      await this.graphClient
        .api(`/users/${userPrincipalName}/messages/${messageId}/${endpoint}`)
        .post(reply);

      return {
        success: true,
        message: 'Reply sent successfully',
      };
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
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!this.graphClient) {
      return {
        success: false,
        error: 'Outlook API not initialized.',
      };
    }

    try {
      const userPrincipalName = userId || this.config.get<string>('MICROSOFT_USER_EMAIL');

      await this.graphClient
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
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!this.graphClient) {
      return {
        success: false,
        error: 'Outlook API not initialized.',
      };
    }

    try {
      const userPrincipalName = userId || this.config.get<string>('MICROSOFT_USER_EMAIL');

      if (permanent) {
        // Permanently delete
        await this.graphClient
          .api(`/users/${userPrincipalName}/messages/${messageId}`)
          .delete();
      } else {
        // Move to Deleted Items folder
        const deletedItemsFolder = await this.graphClient
          .api(`/users/${userPrincipalName}/mailFolders/deleteditems`)
          .get();

        await this.graphClient
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
  ): Promise<SendEmailResult> {
    if (!this.graphClient) {
      return {
        success: false,
        error: 'Outlook API not initialized.',
      };
    }

    try {
      this.logger.log(`Forwarding message ${messageId} to ${toRecipients.join(', ')}`);

      const userPrincipalName = userId || this.config.get<string>('MICROSOFT_USER_EMAIL');

      await this.graphClient
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
  ): Promise<ReadEmailsResult> {
    if (!this.graphClient) {
      return {
        success: false,
        error: 'Outlook API not initialized.',
      };
    }

    try {
      this.logger.log(`Searching emails: ${searchQuery}`);

      const userPrincipalName = userId || this.config.get<string>('MICROSOFT_USER_EMAIL');

      const response = await this.graphClient
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
}
