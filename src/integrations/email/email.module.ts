limport { Module, Provider } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { EmailService as OutlookEmailService } from './email.service';
import { GmailService } from './gmail.service';

import { EmailOAuthService } from './email-oauth.service';
import { EmailOAuthController } from './email-oauth.controller';
import { EmailController } from './email.controller';

import { EmailConnection } from './email-connection.entity';

export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';

const emailProviderFactory: Provider = {
  provide: EMAIL_PROVIDER,
  useFactory: (
    config: ConfigService,
    outlookService: OutlookEmailService,
    gmailService: GmailService,
  ) => {
    const provider = (config.get<string>('EMAIL_PROVIDER') || 'outlook').toLowerCase();
    if (provider === 'gmail') return gmailService;
    return outlookService;
  },
  inject: [ConfigService, OutlookEmailService, GmailService],
};

@Module({
  imports: [TypeOrmModule.forFeature([EmailConnection])],
  providers: [EmailService, OutlookEmailService, GmailService, emailProviderFactory, EmailOAuthService],
  controllers: [EmailOAuthController, EmailController],
  exports: [OutlookEmailService, EMAIL_PROVIDER],
})
export class EmailModule {}
