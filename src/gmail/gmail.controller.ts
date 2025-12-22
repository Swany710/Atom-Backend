import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { GmailService } from './gmail.service';
import { SendEmailDto } from './dto/send-email.dto';
import { EmailQueryDto } from './dto/email-query.dto';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';

/**
 * Gmail Controller
 * Handles Gmail OAuth and email operations
 */
@ApiTags('Gmail')
@Controller('gmail')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GmailController {
  constructor(private readonly gmailService: GmailService) {}

  /**
   * Get Gmail OAuth authorization URL
   */
  @Get('auth-url')
  @ApiOperation({ summary: 'Get Gmail OAuth authorization URL' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Authorization URL retrieved',
  })
  getAuthUrl(): { authUrl: string } {
    const authUrl = this.gmailService.getAuthUrl();
    return { authUrl };
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  @Post('callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange OAuth code for tokens' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Gmail connected successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid authorization code',
  })
  async handleCallback(
    @Body('code') code: string,
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    return this.gmailService.exchangeCodeForTokens(code, user.id);
  }

  /**
   * Send an email
   */
  @Post('send')
  @ApiOperation({ summary: 'Send an email via Gmail' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Email sent successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Gmail not connected',
  })
  async sendEmail(
    @Body() sendEmailDto: SendEmailDto,
    @CurrentUser() user: User,
  ): Promise<{ messageId: string }> {
    return this.gmailService.sendEmail(user.id, sendEmailDto);
  }

  /**
   * Get emails
   */
  @Get('emails')
  @ApiOperation({ summary: 'Retrieve emails from Gmail' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Emails retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Gmail not connected',
  })
  async getEmails(
    @Query() queryDto: EmailQueryDto,
    @CurrentUser() user: User,
  ): Promise<any[]> {
    return this.gmailService.getEmails(user.id, queryDto);
  }

  /**
   * Get specific email by ID
   */
  @Get('emails/:messageId')
  @ApiOperation({ summary: 'Get specific email by ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Email retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Email not found',
  })
  async getEmailById(
    @Param('messageId') messageId: string,
    @CurrentUser() user: User,
  ): Promise<any> {
    return this.gmailService.getEmailById(user.id, messageId);
  }

  /**
   * Mark email as read
   */
  @Post('emails/:messageId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark email as read' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Email marked as read',
  })
  async markAsRead(
    @Param('messageId') messageId: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    await this.gmailService.markAsRead(user.id, messageId);
  }
}
