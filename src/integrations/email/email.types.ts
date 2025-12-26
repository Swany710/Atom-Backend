export type EmailProvider = 'gmail' | 'outlook';

export const emailProviders: EmailProvider[] = ['gmail', 'outlook'];

export function isEmailProvider(value: any): value is EmailProvider {
  return typeof value === 'string' && (value === 'outlook' || value === 'gmail');
}
