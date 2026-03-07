import {
  Controller, Get, Param, Query, BadRequestException,
  Post, Delete, Patch, Body, Inject,
} from '@nestjs/common';
import { Public } from '../../decorators/public.decorator';
import { EmailOAuthService } from './email-oauth.service';
import { GmailService } from './gmail.service';
import { EmailProviderName, emailProviderNames } from './email.types';
import { EMAIL_PROVIDER } from './email.provider';

class SendEmailDto {
  to!:       string[];
  subject!:  string;
  body!:     string;
  cc?:       string[];
  bcc?:      string[];
  html?:     string;
  draftOnly?: boolean;
}

@Public()
@Controller('api/v1/integrations/email')
export class EmailController {
  constructor(
    private readonly emailOAuthService: EmailOAuthService,
    private readonly gmailService: GmailService,
    @Inject(EMAIL_PROVIDER) private readonly emailService: any,
  ) {}

  /* ── Auth ──────────────────────────────────────────────────────── */
  @Get(':provider/auth-url')
  getAuthUrl(
    @Param('provider') provider: EmailProviderName,
    @Query('userId') userId: string,
  ) {
    if (!userId) throw new BadRequestException('userId is required.');
    return { provider, authUrl: this.emailOAuthService.getAuthUrl(provider, userId) };
  }

  @Get(':provider/status')
  async getStatus(
    @Param('provider') provider: EmailProviderName,
    @Query('userId') userId: string,
  ) {
    if (!userId) throw new BadRequestException('userId is required.');
    return this.emailOAuthService.getConnectionStatus(provider, userId);
  }

  /* ── Send / Draft ──────────────────────────────────────────────── */
  @Post('send')
  async sendEmail(@Body() dto: SendEmailDto, @Query('userId') userId = 'default-user') {
    if (!dto.to?.length) throw new BadRequestException('Recipient list (to) must not be empty');
    return this.gmailService.sendEmail(dto.to, dto.subject, dto.body, dto.draftOnly ?? false, dto.cc, dto.bcc, dto.html, userId);
  }

  /* ── Read / Browse ─────────────────────────────────────────────── */
  @Get('read')
  async readEmails(
    @Query('maxResults') maxResults?: string,
    @Query('query') query?: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('userId') userId = 'default-user',
  ) {
    const max    = maxResults ? parseInt(maxResults, 10) || 20 : 20;
    const unread = unreadOnly === 'true' || unreadOnly === '1';
    return this.gmailService.readEmails(max, query, unread, userId);
  }

  @Get('search')
  async searchEmails(
    @Query('q') q: string,
    @Query('maxResults') maxResults?: string,
    @Query('userId') userId = 'default-user',
  ) {
    if (!q) throw new BadRequestException('q is required');
    return this.gmailService.searchEmails(q, maxResults ? parseInt(maxResults, 10) : 20, userId);
  }

  @Get('message/:id')
  async getMessage(@Param('id') id: string, @Query('userId') userId = 'default-user') {
    return this.gmailService.getEmail(id, userId);
  }

  @Get('thread/:id')
  async getThread(@Param('id') id: string, @Query('userId') userId = 'default-user') {
    return this.gmailService.getThread(id, userId);
  }

  @Get('labels')
  async listLabels(@Query('userId') userId = 'default-user') {
    return this.gmailService.listLabels(userId);
  }

  /* ── Reply ─────────────────────────────────────────────────────── */
  @Post('reply')
  async replyToEmail(
    @Body('messageId') messageId: string,
    @Body('body') body: string,
    @Body('replyAll') replyAll?: string,
    @Query('userId') userId = 'default-user',
  ) {
    if (!messageId || !body) throw new BadRequestException('messageId and body are required');
    const replyToAll = replyAll === 'true' || replyAll === '1';
    return this.gmailService.replyToEmail(messageId, body, replyToAll, userId);
  }

  /* ── Mutate ────────────────────────────────────────────────────── */
  @Delete('message/:id')
  async deleteMessage(@Param('id') id: string, @Query('userId') userId = 'default-user') {
    return this.gmailService.deleteEmail(id, userId);
  }

  @Post('message/:id/archive')
  async archiveMessage(@Param('id') id: string, @Query('userId') userId = 'default-user') {
    return this.gmailService.archiveEmail(id, userId);
  }

  @Patch('message/:id/read')
  async markRead(
    @Param('id') id: string,
    @Body('read') read: boolean,
    @Query('userId') userId = 'default-user',
  ) {
    return this.gmailService.markRead(id, read ?? true, userId);
  }

  @Patch('message/:id/move')
  async moveMessage(
    @Param('id') id: string,
    @Body('addLabelIds') addLabelIds: string[] = [],
    @Body('removeLabelIds') removeLabelIds: string[] = [],
    @Query('userId') userId = 'default-user',
  ) {
    return this.gmailService.moveEmail(id, addLabelIds, removeLabelIds, userId);
  }
}
