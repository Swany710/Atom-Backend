/**
 * Single source of truth for:
 *   - EMAIL_PROVIDER  DI injection token
 *   - IEmailService   canonical interface both providers must satisfy
 *   - emailProviderFactory  NestJS provider that selects the active implementation
 *
 * Consumers import EMAIL_PROVIDER (token) and IEmailService (type) from here.
 * Nothing else should re-declare either of these.
 */
import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService as OutlookEmailService } from './email.service';
import { GmailService } from './gmail.service';

// ── Injection token ────────────────────────────────────────────────────────
export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';

// ── Canonical service interface ────────────────────────────────────────────
// Uses loose return types (Record) so both OutlookEmailService and GmailService
// satisfy the interface structurally without requiring identical response shapes.
export interface IEmailService {
  sendEmail(
    to: string[],
    subject: string,
    body: string,
    draftOnly?: boolean,
    cc?: string[],
    bcc?: string[],
    html?: string,
    userId?: string,
  ): Promise<Record<string, unknown>>;

  readEmails(
    maxResults?: number,
    query?: string,
    unreadOnly?: boolean,
    userId?: string,
  ): Promise<Record<string, unknown>>;
}

// ── Factory ────────────────────────────────────────────────────────────────
// Selects the active provider based on the EMAIL_PROVIDER_NAME env var.
// Defaults to 'outlook'. Set EMAIL_PROVIDER_NAME=gmail to switch.
export const emailProviderFactory: Provider = {
  provide: EMAIL_PROVIDER,
  useFactory: (
    config: ConfigService,
    outlookService: OutlookEmailService,
    gmailService: GmailService,
  ): IEmailService => {
    const name = (config.get<string>('EMAIL_PROVIDER_NAME') ?? 'outlook').toLowerCase();
    return name === 'gmail'
      ? (gmailService as unknown as IEmailService)
      : (outlookService as unknown as IEmailService);
  },
  inject: [ConfigService, OutlookEmailService, GmailService],
};
