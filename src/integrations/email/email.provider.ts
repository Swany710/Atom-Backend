import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService as OutlookEmailService } from './email.service';
import { GmailService } from './gmail.service';

export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';

export type EmailProvider = OutlookEmailService | GmailService;

export const emailProviderFactory: Provider = {
  provide: EMAIL_PROVIDER,
  useFactory: (
    config: ConfigService,
    outlookService: OutlookEmailService,
    gmailService: GmailService,
  ): EmailProvider => {
    const provider = (config.get<string>('EMAIL_PROVIDER') || 'outlook').toLowerCase();
    return provider === 'gmail' ? gmailService : outlookService;
  },
  inject: [ConfigService, OutlookEmailService, GmailService],
};
