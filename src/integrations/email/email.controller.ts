import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { EmailOAuthService } from './email-oauth.service';
import { EmailProvider, emailProviders } from './email.types';

@Controller('api/v1/integrations/email')
export class EmailController {
  constructor(private readonly emailOAuthService: EmailOAuthService) {}

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
}
