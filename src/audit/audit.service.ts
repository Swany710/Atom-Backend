import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';

export type AuditAction =
  | 'voice_command'
  | 'text_command'
  | 'conversation_read'
  | 'conversation_clear'
  | 'email_read'
  | 'email_send'
  | 'email_reply'
  | 'email_oauth_connect'
  | 'email_oauth_disconnect'
  | 'calendar_read'
  | 'crm_read'
  | 'crm_create'
  | 'knowledge_base_read'
  | 'knowledge_base_write'
  | 'knowledge_base_delete';

export interface AuditEntry {
  action: AuditAction;
  userId: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Lightweight structured audit logger.
 *
 * Emits JSON lines to stdout (captured by Railway's log shipper).
 * Replace the log call with a DB insert or external sink if needed later.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('AUDIT');

  log(
    action: AuditAction,
    userId: string,
    req?: Request & { correlationId?: string },
    metadata?: Record<string, unknown>,
  ): void {
    const entry: AuditEntry = {
      action,
      userId,
      correlationId: req?.correlationId,
      metadata,
      timestamp: new Date().toISOString(),
    };

    // Emit as a single-line JSON so log shippers can parse it
    this.logger.log(JSON.stringify(entry));
  }
}
