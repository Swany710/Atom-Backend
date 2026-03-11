import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';

export type AuditAction =
  | 'voice_command'
  | 'text_command'
  | 'conversation_read'
  | 'conversation_clear'
  // ── Email reads ────────────────────────────────────────────────────────
  | 'email_read'
  // ── Email writes ───────────────────────────────────────────────────────
  | 'email_send'
  | 'email_reply'
  | 'email_delete'
  | 'email_archive'
  | 'email_mark_read'
  | 'email_oauth_connect'
  | 'email_oauth_disconnect'
  // ── Calendar reads ─────────────────────────────────────────────────────
  | 'calendar_read'
  // ── Calendar writes ────────────────────────────────────────────────────
  | 'calendar_event_create'
  | 'calendar_event_update'
  | 'calendar_event_delete'
  // ── CRM reads ──────────────────────────────────────────────────────────
  | 'crm_read'
  // ── CRM writes ─────────────────────────────────────────────────────────
  | 'crm_create'
  | 'crm_note_add'
  | 'crm_lead_create'
  // ── Knowledge base ─────────────────────────────────────────────────────
  | 'knowledge_base_read'
  | 'knowledge_base_write'
  | 'knowledge_base_delete'
  // ── Pending actions ────────────────────────────────────────────────────
  | 'pending_action_created'
  | 'pending_action_confirmed'
  | 'pending_action_expired';

export interface AuditEntry {
  action: AuditAction;
  userId: string;
  correlationId?: string;
  /** Target system that the action was applied to (e.g. 'gmail', 'google_calendar') */
  targetSystem?: string;
  /** ID of the specific resource acted upon (message ID, event ID, job ID, …) */
  targetId?: string;
  /** Snapshot of the call arguments (sanitised — no secrets) */
  argsSnapshot?: Record<string, unknown>;
  /** Final result summary */
  resultSummary?: string;
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

  /**
   * logWrite — dedicated helper for every provider write action.
   *
   * Records who did what, to which system, with what arguments, and what
   * the outcome was.  Call this in executeFunctionCall AFTER the provider
   * call resolves (or in the catch to record failures).
   */
  logWrite(params: {
    action: AuditAction;
    userId: string;
    correlationId?: string;
    targetSystem: string;
    targetId?: string;
    argsSnapshot: Record<string, unknown>;
    resultSummary: string;
  }): void {
    const entry: AuditEntry = {
      action:        params.action,
      userId:        params.userId,
      correlationId: params.correlationId,
      targetSystem:  params.targetSystem,
      targetId:      params.targetId,
      argsSnapshot:  params.argsSnapshot,
      resultSummary: params.resultSummary,
      timestamp:     new Date().toISOString(),
    };

    this.logger.log(JSON.stringify(entry));
  }
}
