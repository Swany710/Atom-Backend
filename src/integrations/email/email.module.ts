import { Module, Provider } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService as OutlookEmailService } from './email.service';
import { GmailService } from './gmail.service';

export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';

// Factory provider that returns either the Outlook service or the Gmail
// service depending on the EMAIL_PROVIDER environment variable. The default
// is 'outlook'. See README or deployment configuration for details on
// specifying the provider.
const emailProviderFactory: Provider = {
  provide: EMAIL_PROVIDER,
  useFactory: (
    config: ConfigService,
    outlookService: OutlookEmailService,
    gmailService: GmailService,
  ) => {
    const provider = (config.get<string>('EMAIL_PROVIDER') || 'outlook').toLowerCase();
    if (provider === 'gmail') {
      return gmailService;
    }
    return outlookService;
  },
  inject: [ConfigService, OutlookEmailService, GmailService],
};
import { EmailOAuthService } from './email-oauth.service';
import { EmailOAuthController } from './email-oauth.controller';
import { EmailController } from './email.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EmailConnection])],
  providers: [OutlookEmailService, GmailService, emailProviderFactory, EmailOAuthService],
  controllers: [EmailOAuthController, EmailController],
  exports: [EMAIL_PROVIDER],
})
export class EmailModule {}
