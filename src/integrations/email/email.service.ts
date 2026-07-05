import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailConnection } from './email-connection.entity';
import { EmailProviderName } from './email.types';
import { OutlookTransport } from './outlook.transport';
import { GmailLegacyTransport } from './gmail-legacy.transport';
import {
  MarkEmailResult,
  ReadEmailsResult,
  SendEmailResult,
} from './email-message.types';

// Re-export shared shapes so existing imports from './email.service' keep working.
export {
  EmailMessage,
  ReadEmailsResult,
  SendEmailResult,
} from './email-message.types';

/**
 * EmailService — thin provider router.
 *
 * The actual API calls live in:
 *   outlook.transport.ts      — Microsoft Graph (Outlook)
 *   gmail-legacy.transport.ts — raw-REST Gmail fallback
 *
 * This class only resolves which provider a user is on and delegates.
 * Public method signatures are unchanged from the pre-split version, so
 * email.provider.ts / email.facade.service.ts / consumers need no changes.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @InjectRepository(EmailConnection)
    private readonly connectionRepo: Repository<EmailConnection>,
    private readonly outlook: OutlookTransport,
    private readonly gmail: GmailLegacyTransport,
  ) {}

  /** Send an email or create a draft */
  async sendEmail(
    to: string[],
    subject: string,
    body: string,
    draftOnly: boolean = false,
    cc?: string[],
    bcc?: string[],
    html?: string,
    userId?: string,
    provider?: EmailProviderName,
  ): Promise<SendEmailResult> {
    try {
      const resolved = await this.resolveProvider(userId, provider);
      return resolved === 'gmail'
        ? this.gmail.send(userId, to, subject, body, draftOnly, cc, bcc, html)
        : this.outlook.send(userId, to, subject, body, draftOnly, cc, bcc, html);
    } catch (error: any) {
      this.logger.error('Error sending email:', error);
      return { success: false, error: error.message || 'Failed to send email' };
    }
  }

  /** Read recent emails */
  async readEmails(
    maxResults: number = 10,
    query?: string,
    unreadOnly: boolean = false,
    userId?: string,
    provider?: EmailProviderName,
  ): Promise<ReadEmailsResult> {
    try {
      const resolved = await this.resolveProvider(userId, provider);
      this.logger.log(`Reading emails (provider: ${resolved})`);
      return resolved === 'gmail'
        ? this.gmail.read(userId, maxResults, query, unreadOnly)
        : this.outlook.read(userId, maxResults, query, unreadOnly);
    } catch (error: any) {
      this.logger.error('Error reading emails:', error);
      return { success: false, error: error.message || 'Failed to read emails' };
    }
  }

  /** Reply to an email */
  async replyToEmail(
    messageId: string,
    replyBody: string,
    replyAll: boolean = false,
    userId?: string,
    provider?: EmailProviderName,
  ): Promise<SendEmailResult> {
    try {
      const resolved = await this.resolveProvider(userId, provider);
      if (resolved === 'gmail') {
        return {
          success: false,
          error: 'Gmail reply is not implemented yet. Please send a new email instead.',
        };
      }
      return await this.outlook.reply(userId, messageId, replyBody, replyAll);
    } catch (error: any) {
      this.logger.error('Error replying to email:', error);
      return { success: false, error: error.message || 'Failed to send reply' };
    }
  }

  /** Mark email as read/unread */
  async markEmail(
    messageId: string,
    markAsRead: boolean = true,
    userId?: string,
    provider?: EmailProviderName,
  ): Promise<MarkEmailResult> {
    try {
      const resolved = await this.resolveProvider(userId, provider);
      return resolved === 'gmail'
        ? this.gmail.mark(userId, messageId, markAsRead)
        : this.outlook.mark(userId, messageId, markAsRead);
    } catch (error: any) {
      this.logger.error('Error marking email:', error);
      return { success: false, error: error.message || 'Failed to mark email' };
    }
  }

  /** Delete an email */
  async deleteEmail(
    messageId: string,
    permanent: boolean = false,
    userId?: string,
    provider?: EmailProviderName,
  ): Promise<MarkEmailResult> {
    try {
      const resolved = await this.resolveProvider(userId, provider);
      return resolved === 'gmail'
        ? this.gmail.delete(userId, messageId, permanent)
        : this.outlook.delete(userId, messageId, permanent);
    } catch (error: any) {
      this.logger.error('Error deleting email:', error);
      return { success: false, error: error.message || 'Failed to delete email' };
    }
  }

  /** Forward an email */
  async forwardEmail(
    messageId: string,
    toRecipients: string[],
    comment?: string,
    userId?: string,
    provider?: EmailProviderName,
  ): Promise<SendEmailResult> {
    try {
      const resolved = await this.resolveProvider(userId, provider);
      if (resolved === 'gmail') {
        return {
          success: false,
          error: 'Gmail forward is not implemented yet. Please send a new email instead.',
        };
      }
      return await this.outlook.forward(userId, messageId, toRecipients, comment);
    } catch (error: any) {
      this.logger.error('Error forwarding email:', error);
      return { success: false, error: error.message || 'Failed to forward email' };
    }
  }

  /** Search emails */
  async searchEmails(
    searchQuery: string,
    maxResults: number = 20,
    userId?: string,
    provider?: EmailProviderName,
  ): Promise<ReadEmailsResult> {
    try {
      const resolved = await this.resolveProvider(userId, provider);
      this.logger.log(`Searching emails: ${searchQuery}`);
      return resolved === 'gmail'
        ? this.gmail.read(userId, maxResults, searchQuery, false)
        : this.outlook.search(userId, searchQuery, maxResults);
    } catch (error: any) {
      this.logger.error('Error searching emails:', error);
      return { success: false, error: error.message || 'Failed to search emails' };
    }
  }

  // ── Provider resolution ────────────────────────────────────────────────────

  /**
   * Public lookup used by ToolExecutionService to route email tools to the
   * provider the user actually connected (most recently updated connection).
   */
  async getActiveProvider(userId?: string): Promise<EmailProviderName> {
    return this.resolveProvider(userId);
  }

  private async resolveProvider(
    userId?: string,
    provider?: EmailProviderName,
  ): Promise<EmailProviderName> {
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
}
