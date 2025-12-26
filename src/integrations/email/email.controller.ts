import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
  Post,
  Body,
  Inject,
} from '@nestjs/common';
// Import services and types from the src/integrations directory.  The controller
// lives at the project root, so we import from the nested source folder rather
// than from the same directory.  These imports ensure the correct files are
// referenced without altering application structure.
import { EmailOAuthService } from './src/integrations/email/email-oauth.service';
import { EmailProvider, emailProviders } from './src/integrations/email/email.types';

// Import the EMAIL_PROVIDER token to inject the configured email service.
import { EMAIL_PROVIDER } from './src/integrations/email/email.module';

// Data transfer object for sending emails. The 'to' field is required.
class SendEmailDto {
  to!: string[];
  subject!: string;
  body!: string;
  cc?: string[];
  bcc?: string[];
  html?: string;
  draftOnly?: boolean;
}

@Controller('api/v1/integrations/email')
export class EmailController {
  constructor(
    private readonly emailOAuthService: EmailOAuthService,
    @Inject(EMAIL_PROVIDER) private readonly emailService: any,
  ) {}

  @Get(':provider/auth-url')
  getAuthUrl(
    @Param('provider') provider: EmailProvider,
    @Query('userId') userId: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId is required.');
    }

    return {
      provider,
      authUrl: this.emailOAuthService.getAuthUrl(provider, userId),
    };
  }

  @Get(':provider/callback')
  async handleCallback(
    @Param('provider') provider: EmailProvider,
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    if (!emailProviders.includes(provider)) {
      throw new BadRequestException('Unsupported provider.');
    }

    if (!code) {
      throw new BadRequestException('code is required.');
    }

    const connection = await this.emailOAuthService.handleCallback(
      provider,
      code,
      state,
    );

    return {
      success: true,
      provider: connection.provider,
      emailAddress: connection.emailAddress,
    };
  }

  @Get(':provider/status')
  async getStatus(
    @Param('provider') provider: EmailProvider,
    @Query('userId') userId: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId is required.');
    }

    return this.emailOAuthService.getConnectionStatus(provider, userId);
  }

  // Send an email via the configured provider.
  @Post('send')
  async sendEmail(@Body() dto: SendEmailDto) {
    if (!dto.to || dto.to.length === 0) {
      throw new BadRequestException('Recipient list (to) must not be empty');
    }
    return this.emailService.sendEmail(
      dto.to,
      dto.subject,
      dto.body,
      dto.draftOnly || false,
      dto.cc,
      dto.bcc,
      dto.html,
    );
  }

  // Retrieve recent emails. Supports optional query parameters:
  // - maxResults: number of messages to return (default 10)
  // - query: search query (Gmail search syntax)
  // - unreadOnly: whether to filter for unread messages
  @Get('read')
  async readEmails(
    @Query('maxResults') maxResults?: string,
    @Query('query') query?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const max = maxResults ? parseInt(maxResults, 10) || 10 : 10;
    const unread = unreadOnly === 'true' || unreadOnly === '1';
    return this.emailService.readEmails(max, query, unread);
  }

  // Reply to an email. Accepts messageId and body in the request body.
  // Optional replyAll flag sends the reply to all recipients.
  @Post('reply')
  async replyToEmail(
    @Body('messageId') messageId: string,
    @Body('body') body: string,
    @Body('replyAll') replyAll?: string,
  ) {
    if (!messageId || !body) {
      throw new BadRequestException('messageId and body are required');
    }
    const replyToAll = replyAll === 'true' || replyAll === '1';
    return this.emailService.replyToEmail(messageId, body, replyToAll);
  }
}
