/**
 * String discriminant for selecting an email provider by name.
 * Used in OAuth flows, DB entities, and route params.
 *
 * NOTE: The DI injection token (EMAIL_PROVIDER) and the service union type
 * (IEmailService) both live in email.provider.ts — single source of truth.
 */
export type EmailProviderName = 'gmail' | 'outlook';

export const emailProviderNames: EmailProviderName[] = ['gmail', 'outlook'];

export function isEmailProviderName(value: unknown): value is EmailProviderName {
  return value === 'gmail' || value === 'outlook';
}
