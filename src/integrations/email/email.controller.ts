import {
  Controller, Get, Param, Query, BadRequestException,
  Post, Delete, Patch, Body, Inject, Req,
} from '@nestjs/common';

import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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

@ApiBearerAuth('bearer')
@ApiTags('Email')
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
    @Req() req: any,
  ) {
    const userId: string = (req as any).atomUserId;
    if (!userId) throw new BadRequestException('userId is required.');
    return { provider, authUrl: this.emailOAuthService.getAuthUrl(provider, userId) };
  }

  @Get(':provider/status')
  async getStatus(
    @Param('provider') provider: EmailProviderName,
    @Req() req: any,
  ) {
    const userId: string = (req as any).atomUserId;
    if (!userId) throw new BadRequestException('userId is required.');
    return this.emailOAuthService.getConnectionStatus(provider, userId);
  }

  /* ── Send / Draft ──────────────────────────────────────────────── */
  @Post('send')
  async sendEmail(@Body() dto: SendEmailDto, @Req() req: any) {
    const userId: string = (req as any).atomUserId;
    if (!dto.to?.length) throw new BadRequestException('Recipient list (to) must not be empty');
    return this.gmailService.sendEmail(dto.to, dto.subject, dto.body, dto.draftOnly ?? false, dto.cc, dto.bcc, dto.html, userId);
  }

  /* ── Read / Browse ─────────────────────────────────────────────── */
  @Get('read')
  async readEmails(
    @Req() req: any,
    @Query('maxResults') maxResults?: string,
    @Query('query') query?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const userId: string = (req as any).atomUserId;
    const max    = maxResults ? parseInt(maxResults, 10) || 20 : 20;
    const unread = unreadOnly === 'true' || unreadOnly === '1';
    return this.gmailService.readEmails(max, query, unread, userId);
  }

  @Get('search')
  async searchEmails(
    @Req() req: any,
    @Query('q') q: string,
    @Query('maxResults') maxResults?: string,
  ) {
    const userId: string = (req as any).atomUserId;
    if (!q) throw new BadRequestException('q is required');
    return this.gmailService.searchEmails(q, maxResults ? parseInt(maxResults, 10) : 20, userId);
  }

  @Get('message/:id')
  async getMessage(@Param('id') id: string, @Req() req: any) {
    const userId: string = (req as any).atomUserId;
    return this.gmailService.getEmail(id, userId);
  }

  @Get('thread/:id')
  async getThread(@Param('id') id: string, @Req() req: any) {
    const userId: string = (req as any).atomUserId;
    return this.gmailService.getThread(id, userId);
  }

  @Get('labels')
  async listLabels(@Req() req: any) {
    const userId: string = (req as any).atomUserId;
    return this.gmailService.listLabels(userId);
  }

  /* ── Reply ─────────────────────────────────────────────────────── */
  @Post('reply')
  async replyToEmail(
    @Req() req: any,
    @Body('messageId') messageId: string,
    @Body('body') body: string,
    @Body('replyAll') replyAll?: string,
  ) {
    const userId: string = (req as any).atomUserId;
    if (!messageId || !body) throw new BadRequestException('messageId and body are required');
    const replyToAll = replyAll === 'true' || replyAll === '1';
    return this.gmailService.replyToEmail(messageId, body, replyToAll, userId);
  }

  /* ── Mutate ────────────────────────────────────────────────────── */
  @Delete('message/:id')
  async deleteMessage(@Param('id') id: string, @Req() req: any) {
    const userId: string = (req as any).atomUserId;
    return this.gmailService.deleteEmail(id, userId);
  }

  @Post('message/:id/archive')
  async archiveMessage(@Param('id') id: string, @Req() req: any) {
    const userId: string = (req as any).atomUserId;
    return this.gmailService.archiveEmail(id, userId);
  }

  @Patch('message/:id/read')
  async markRead(
    @Param('id') id: string,
    @Body('read') read: boolean,
    @Req() req: any,
  ) {
    const userId: string = (req as any).atomUserId;
    return this.gmailService.markRead(id, read ?? true, userId);
  }

  @Patch('message/:id/move')
  async moveMessage(
    @Param('id') id: string,
    @Body('addLabelIds') addLabelIds: string[] = [],
    @Body('removeLabelIds') removeLabelIds: string[] = [],
    @Req() req: any,
  ) {
    const userId: string = (req as any).atomUserId;
    return this.gmailService.moveEmail(id, addLabelIds, removeLabelIds, userId);
  }

  /* ── Sent ──────────────────────────────────────────────────────── */
  @Get('sent')
  async getSent(
    @Req() req: any,
    @Query('maxResults') maxResults?: string,
  ) {
    const userId: string = (req as any).atomUserId;
    return this.gmailService.searchEmails('in:sent', maxResults ? parseInt(maxResults, 10) : 20, userId);
  }
}
