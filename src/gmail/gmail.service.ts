import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { AuthService } from '../auth/auth.service';
import { SendEmailDto } from './dto/send-email.dto';
import { EmailQueryDto } from './dto/email-query.dto';

/**
 * Gmail Service
 * Handles Gmail OAuth authentication and email operations
 */
@Injectable()
export class GmailService {
  private oauth2Client: OAuth2Client;

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.get<string>('GOOGLE_REDIRECT_URI'),
    );
  }

  /**
   * Get Google OAuth authorization URL
   * @returns Authorization URL for user to grant Gmail access
   */
  getAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
    });
  }

  /**
   * Exchange authorization code for tokens
   * @param code Authorization code from OAuth callback
   * @param userId User ID to store tokens for
   * @returns Success message
   */
  async exchangeCodeForTokens(
    code: string,
    userId: string,
  ): Promise<{ message: string }> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new BadRequestException('Failed to obtain access token');
      }

      // Calculate token expiry date
      const expiryDate = new Date();
      if (tokens.expiry_date) {
        expiryDate.setTime(tokens.expiry_date);
      } else {
        expiryDate.setHours(expiryDate.getHours() + 1);
      }

      // Store tokens in user record
      await this.authService.updateGoogleTokens(
        userId,
        'google-id', // In production, get this from userinfo endpoint
        tokens.access_token,
        tokens.refresh_token || null,
        expiryDate,
      );

      return { message: 'Gmail connected successfully' };
    } catch (error) {
      throw new BadRequestException('Invalid authorization code');
    }
  }

  /**
   * Send an email via Gmail
   * @param userId User ID
   * @param sendEmailDto Email data
   * @returns Sent message ID
   */
  async sendEmail(
    userId: string,
    sendEmailDto: SendEmailDto,
  ): Promise<{ messageId: string }> {
    const gmail = await this.getGmailClient(userId);

    // Create email message
    const { to, subject, body, cc, bcc, html } = sendEmailDto;
    const message = this.createEmailMessage(to, subject, body, cc, bcc, html);

    try {
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: message,
        },
      });

      return { messageId: response.data.id || 'unknown' };
    } catch (error) {
      throw new InternalServerErrorException('Failed to send email');
    }
  }

  /**
   * Retrieve emails from Gmail
   * @param userId User ID
   * @param queryDto Query parameters
   * @returns List of emails
   */
  async getEmails(userId: string, queryDto: EmailQueryDto): Promise<any[]> {
    const gmail = await this.getGmailClient(userId);

    try {
      // List messages
      const listResponse = await gmail.users.messages.list({
        userId: 'me',
        q: queryDto.query,
        maxResults: queryDto.maxResults,
        labelIds: queryDto.labelId ? [queryDto.labelId] : undefined,
      });

      const messages = listResponse.data.messages || [];

      // Fetch full message details
      const emailPromises = messages.map(async (message) => {
        const msgResponse = await gmail.users.messages.get({
          userId: 'me',
          id: message.id!,
          format: 'full',
        });

        return this.parseEmail(msgResponse.data);
      });

      return await Promise.all(emailPromises);
    } catch (error) {
      throw new InternalServerErrorException('Failed to retrieve emails');
    }
  }

  /**
   * Get a specific email by ID
   * @param userId User ID
   * @param messageId Gmail message ID
   * @returns Email details
   */
  async getEmailById(userId: string, messageId: string): Promise<any> {
    const gmail = await this.getGmailClient(userId);

    try {
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      return this.parseEmail(response.data);
    } catch (error) {
      throw new BadRequestException('Email not found');
    }
  }

  /**
   * Mark email as read
   * @param userId User ID
   * @param messageId Gmail message ID
   */
  async markAsRead(userId: string, messageId: string): Promise<void> {
    const gmail = await this.getGmailClient(userId);

    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });
    } catch (error) {
      throw new BadRequestException('Failed to mark email as read');
    }
  }

  /**
   * Get authenticated Gmail client for user
   * @param userId User ID
   * @returns Gmail API client
   */
  private async getGmailClient(userId: string) {
    const user = await this.authService.getUserById(userId);

    if (!user.googleAccessToken) {
      throw new UnauthorizedException('Gmail not connected');
    }

    // Check if token is expired
    if (user.googleTokenExpiry && user.googleTokenExpiry < new Date()) {
      // Refresh token
      if (!user.googleRefreshToken) {
        throw new UnauthorizedException('Gmail token expired, please reconnect');
      }

      await this.refreshAccessToken(userId, user.googleRefreshToken);
      // Refetch user with new token
      const updatedUser = await this.authService.getUserById(userId);
      this.oauth2Client.setCredentials({
        access_token: updatedUser.googleAccessToken,
        refresh_token: updatedUser.googleRefreshToken,
      });
    } else {
      this.oauth2Client.setCredentials({
        access_token: user.googleAccessToken,
        refresh_token: user.googleRefreshToken || undefined,
      });
    }

    return google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  /**
   * Refresh access token using refresh token
   * @param userId User ID
   * @param refreshToken Refresh token
   */
  private async refreshAccessToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      const expiryDate = new Date();
      if (credentials.expiry_date) {
        expiryDate.setTime(credentials.expiry_date);
      } else {
        expiryDate.setHours(expiryDate.getHours() + 1);
      }

      await this.authService.updateGoogleTokens(
        userId,
        'google-id',
        credentials.access_token!,
        credentials.refresh_token || null,
        expiryDate,
      );
    } catch (error) {
      throw new UnauthorizedException('Failed to refresh token');
    }
  }

  /**
   * Create email message in RFC 2822 format
   */
  private createEmailMessage(
    to: string,
    subject: string,
    body: string,
    cc?: string[],
    bcc?: string[],
    html?: string,
  ): string {
    const headers = [
      `To: ${to}`,
      `Subject: ${subject}`,
      cc && cc.length > 0 ? `Cc: ${cc.join(', ')}` : null,
      bcc && bcc.length > 0 ? `Bcc: ${bcc.join(', ')}` : null,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
    ]
      .filter(Boolean)
      .join('\r\n');

    const message = `${headers}\r\n\r\n${html || body}`;

    // Base64 encode and make URL safe
    return Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Parse Gmail message data into a readable format
   */
  private parseEmail(message: any): any {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h: any) => h.name === name)?.value;

    return {
      id: message.id,
      threadId: message.threadId,
      subject: getHeader('Subject'),
      from: getHeader('From'),
      to: getHeader('To'),
      date: getHeader('Date'),
      snippet: message.snippet,
      labelIds: message.labelIds,
    };
  }
}
