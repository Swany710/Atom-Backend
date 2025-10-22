import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

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
  private gmail: any;
  private oauth2Client: OAuth2Client;

  constructor(private readonly config: ConfigService) {
    this.initializeGmail();
  }

  /**
   * Initialize Gmail API client
   */
  private initializeGmail() {
    try {
      const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
      const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
      const refreshToken = this.config.get<string>('GOOGLE_REFRESH_TOKEN');

      if (!clientId || !clientSecret) {
        this.logger.warn('Gmail credentials not configured. Email features will be disabled.');
        return;
      }

      // Initialize OAuth2 client
      this.oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'http://localhost:3000/auth/google/callback'
      );

      // Set refresh token if available
      if (refreshToken) {
        this.oauth2Client.setCredentials({
          refresh_token: refreshToken,
        });
      }

      // Initialize Gmail API
      this.gmail = google.gmail({
        version: 'v1',
        auth: this.oauth2Client,
      });

      this.logger.log('Gmail API initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Gmail API:', error);
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
    if (!this.gmail) {
      return {
        success: false,
        error: 'Gmail API not initialized. Please configure Google credentials.',
      };
    }

    try {
      this.logger.log(`${draftOnly ? 'Creating draft' : 'Sending email'} to: ${to.join(', ')}`);

      // Build email message
      const email = this.buildEmailMessage({
        to,
        cc,
        bcc,
        subject,
        body,
        html,
      });

      if (draftOnly) {
        // Create draft
        const response = await this.gmail.users.drafts.create({
          userId: 'me',
          requestBody: {
            message: {
              raw: email,
            },
          },
        });

        return {
          success: true,
          draftId: response.data.id,
          message: `Draft created successfully`,
        };
      } else {
        // Send email
        const response = await this.gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: email,
          },
        });

        return {
          success: true,
          messageId: response.data.id,
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
    if (!this.gmail) {
      return {
        success: false,
        error: 'Gmail API not initialized. Please configure Google credentials.',
      };
    }

    try {
      this.logger.log(`Reading emails (max: ${maxResults}, query: ${query || 'none'})`);

      // Build search query
      let searchQuery = query || '';
      if (unreadOnly && !searchQuery.includes('is:unread')) {
        searchQuery = searchQuery ? `${searchQuery} is:unread` : 'is:unread';
      }

      // Get message IDs
      const listResponse = await this.gmail.users.messages.list({
        userId: 'me',
        q: searchQuery,
        maxResults,
      });

      const messages = listResponse.data.messages || [];

      if (messages.length === 0) {
        return {
          success: true,
          emails: [],
          count: 0,
          message: 'No emails found',
        };
      }

      // Fetch full message details
      const emails: EmailMessage[] = await Promise.all(
        messages.map(async (msg: any) => {
          const details = await this.gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full',
          });

          return this.parseEmailMessage(details.data);
        })
      );

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
    threadId: string,
    replyBody: string,
    replyAll: boolean = false,
    userId?: string,
  ): Promise<SendEmailResult> {
    if (!this.gmail) {
      return {
        success: false,
        error: 'Gmail API not initialized. Please configure Google credentials.',
      };
    }

    try {
      this.logger.log(`Replying to thread: ${threadId}`);

      // Get original message to extract recipients
      const thread = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId,
      });

      const originalMessage = thread.data.messages[0];
      const headers = originalMessage.payload.headers;

      const from = this.getHeader(headers, 'From');
      const to = this.getHeader(headers, 'To');
      const cc = replyAll ? this.getHeader(headers, 'Cc') : '';
      const subject = this.getHeader(headers, 'Subject');

      // Build reply
      const replyTo = from ? [this.extractEmail(from)] : [];
      const replyCc = replyAll && cc ? cc.split(',').map(e => this.extractEmail(e.trim())) : undefined;

      const email = this.buildEmailMessage({
        to: replyTo,
        cc: replyCc,
        subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
        body: replyBody,
      });

      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: email,
          threadId, // Keep in same thread
        },
      });

      return {
        success: true,
        messageId: response.data.id,
        message: `Reply sent successfully`,
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
    if (!this.gmail) {
      return {
        success: false,
        error: 'Gmail API not initialized.',
      };
    }

    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: markAsRead ? ['UNREAD'] : [],
          addLabelIds: markAsRead ? [] : ['UNREAD'],
        },
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
    if (!this.gmail) {
      return {
        success: false,
        error: 'Gmail API not initialized.',
      };
    }

    try {
      if (permanent) {
        await this.gmail.users.messages.delete({
          userId: 'me',
          id: messageId,
        });
      } else {
        await this.gmail.users.messages.trash({
          userId: 'me',
          id: messageId,
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

  /* -------------------------------------------------------------------------
   * Helper Methods
   * ----------------------------------------------------------------------- */

  /**
   * Build RFC 2822 formatted email message
   */
  private buildEmailMessage(email: Partial<EmailMessage>): string {
    const lines = [];

    if (email.to && email.to.length > 0) {
      lines.push(`To: ${email.to.join(', ')}`);
    }
    if (email.cc && email.cc.length > 0) {
      lines.push(`Cc: ${email.cc.join(', ')}`);
    }
    if (email.bcc && email.bcc.length > 0) {
      lines.push(`Bcc: ${email.bcc.join(', ')}`);
    }
    if (email.subject) {
      lines.push(`Subject: ${email.subject}`);
    }

    lines.push('MIME-Version: 1.0');

    if (email.html) {
      lines.push('Content-Type: text/html; charset=utf-8');
      lines.push('');
      lines.push(email.html);
    } else {
      lines.push('Content-Type: text/plain; charset=utf-8');
      lines.push('');
      lines.push(email.body || '');
    }

    const message = lines.join('\r\n');

    // Encode in base64url format
    return Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Parse Gmail message into EmailMessage interface
   */
  private parseEmailMessage(message: any): EmailMessage {
    const headers = message.payload?.headers || [];

    const from = this.getHeader(headers, 'From');
    const to = this.getHeader(headers, 'To');
    const cc = this.getHeader(headers, 'Cc');
    const subject = this.getHeader(headers, 'Subject');
    const date = this.getHeader(headers, 'Date');

    // Extract body
    let body = '';
    if (message.payload?.body?.data) {
      body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    } else if (message.payload?.parts) {
      // Multi-part message
      const textPart = message.payload.parts.find((part: any) => part.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    }

    return {
      id: message.id,
      threadId: message.threadId,
      from,
      to: to ? to.split(',').map(e => e.trim()) : [],
      cc: cc ? cc.split(',').map(e => e.trim()) : undefined,
      subject,
      body,
      date,
      snippet: message.snippet,
    };
  }

  /**
   * Get header value by name
   */
  private getHeader(headers: any[], name: string): string {
    const header = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
    return header?.value || '';
  }

  /**
   * Extract email address from "Name <email@example.com>" format
   */
  private extractEmail(text: string): string {
    const match = text.match(/<(.+?)>/);
    return match ? match[1] : text.trim();
  }

  /**
   * Get authorization URL for OAuth flow
   */
  getAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.compose',
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async handleAuthCallback(code: string): Promise<{ success: boolean; tokens?: any; error?: string }> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      this.logger.log('Successfully obtained Gmail tokens');
      this.logger.log('IMPORTANT: Save this refresh token to your .env file:');
      this.logger.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);

      return {
        success: true,
        tokens,
      };
    } catch (error) {
      this.logger.error('Error handling auth callback:', error);
      return {
        success: false,
        error: error.message || 'Failed to exchange auth code',
      };
    }
  }
}
