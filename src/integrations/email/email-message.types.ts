/**
 * Shared message/result shapes for the email transports.
 * Extracted from email.service.ts when it was split into
 * outlook.transport.ts + gmail-legacy.transport.ts + a thin router.
 */

export interface EmailMessage {
  id?: string;
  from?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  html?: string;
  threadId?: string;
  date?: string;
  snippet?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  message?: string;
  draftId?: string;
  error?: string;
}

export interface ReadEmailsResult {
  success: boolean;
  emails?: EmailMessage[];
  count?: number;
  message?: string;
  error?: string;
}

export interface MarkEmailResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}
