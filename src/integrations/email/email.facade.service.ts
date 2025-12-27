import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_PROVIDER } from './email.module';
import { EmailService as OutlookEmailService } from './email.service';
import { GmailService } from './gmail.service';

type Provider = OutlookEmailService | GmailService;

@Injectable()
export class EmailService {
  constructor(@Inject(EMAIL_PROVIDER) private readonly provider: Provider) {}

  // Adjust these method names to match what your GmailService / OutlookEmailService actually expose.
  async sendEmail(payload: any) {
    const anyProvider = this.provider as any;

    if (typeof anyProvider.sendEmail === 'function') {
      return anyProvider.sendEmail(payload);
    }

    if (typeof anyProvider.send === 'function') {
      return anyProvider.send(payload);
    }

    throw new Error('Email provider does not implement sendEmail/send');
  }
}
