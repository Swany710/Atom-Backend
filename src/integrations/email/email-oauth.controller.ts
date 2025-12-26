import { Controller, Get, Query, Res, HttpStatus } from '@nestjs/common';
import { EmailOAuthService } from './email-oauth.service';
import { EmailProvider } from './email.types';

/**
 * Controller to handle OAuth-related HTTP endpoints for email providers.
 */
@Controller('email/oauth')
export class EmailOAuthController {
  constructor(private readonly emailOAuthService: EmailOAuthService) {}

  /** Generate an authorization URL for the specified email provider. */
  @Get('url')
  getAuthUrl(
    @Query('provider') provider: EmailProvider,
    @Query('userId') userId: string,
  ) {
    return this.emailOAuthService.getAuthUrl(provider, userId);
  }

  /**
   * Handle the OAuth callback after the user has granted access.
   * Returns a success message after saving the connection.
   */
  @Get('callback')
  async handleCallback(
    @Query('provider') provider: EmailProvider,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: any,
  ) {
    await this.emailOAuthService.handleCallback(provider, code, state);
    return res.status(HttpStatus.OK).json({ message: 'Email account connected successfully' });
  }

  /** Check whether a user has an active email connection for the given provider. */
  @Get('status')
  async getStatus(
    @Query('provider') provider: EmailProvider,
    @Query('userId') userId: string,
  ) {
    return this.emailOAuthService.getConnectionStatus(provider, userId);
  }
}
