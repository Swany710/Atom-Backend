import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmailService as OutlookEmailService } from './email.service';
import { OutlookTransport } from './outlook.transport';
import { GmailLegacyTransport } from './gmail-legacy.transport';
import { GmailService } from './gmail.service';
import { EmailOAuthService } from './email-oauth.service';
import { EmailOAuthController } from './email-oauth.controller';
import { EmailController } from './email.controller';
import { EmailConnection } from './email-connection.entity';

// Single source of truth — token + factory live in email.provider.ts
import { EMAIL_PROVIDER, emailProviderFactory } from './email.provider';

@Module({
  imports: [TypeOrmModule.forFeature([EmailConnection])],
  providers: [
    OutlookEmailService,
    OutlookTransport,       // Microsoft Graph operations (split from email.service.ts)
    GmailLegacyTransport,   // raw-REST Gmail fallback  (split from email.service.ts)
    GmailService,
    emailProviderFactory,
    EmailOAuthService,
  ],
  controllers: [EmailOAuthController, EmailController],
  exports: [EMAIL_PROVIDER, OutlookEmailService, OutlookTransport, GmailService, EmailOAuthService],
})
export class EmailModule {}
