import { Inject, Injectable, Logger } from '@nestjs/common';
import { EMAIL_PROVIDER, IEmailService } from '../integrations/email/email.provider';
import { GmailService } from '../integrations/email/gmail.service';
import { CalendarService } from '../integrations/calendar/calendar.service';
import { GoogleCalendarService } from '../integrations/calendar/google-calendar.service';
import { AccuLynxService } from '../integrations/crm/acculynx.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { ToolDefinitionsService } from './tool-definitions.service';
import { PendingActionService, ConfirmationRequired } from '../pending-actions/pending-action.service';
import { AuditService } from '../audit/audit.service';
import { providerRead, providerWrite } from '../utils/provider-call';

/**
 * ToolExecutionService
 *
 * Execution layer between Claude's tool-use decisions and the actual
 * provider integrations (Gmail, Google Calendar, AccuLynx, Knowledge Base).
 *
 * Responsibilities:
 *   - Route tool calls to the correct provider service
 *   - Enforce the pending-action confirmation gate for every WRITE tool
 *   - Record audit entries for every executed write
 *   - Wrap every external call with providerRead / providerWrite for
 *     consistent timeout + retry behaviour
 *
 * What this service does NOT do:
 *   - Call Claude / Anthropic  →  ClaudeTaskOrchestratorService
 *   - Manage voice or audio    →  OpenAiVoiceGatewayService
 *   - Persist conversation     →  ConversationMemoryService
 *
 * Write-confirmation flow:
 *   1. Claude calls a write tool WITHOUT pendingActionId.
 *   2. This service calls PendingActionService.create() and returns
 *      { requiresConfirmation: true, pendingActionId, summary, expiresAt }.
 *   3. ClaudeTaskOrchestratorService feeds that back to Claude as a tool_result.
 *   4. Claude shows the summary to the user and waits.
 *   5. User confirms.  Claude calls the same tool WITH pendingActionId.
 *   6. This service validates + claims the pending action and executes for real.
 */
@Injectable()
export class ToolExecutionService {
  private readonly logger = new Logger(ToolExecutionService.name);

  constructor(
    private readonly gmailService: GmailService,
    private readonly calendarService: CalendarService,
    private readonly googleCalendar: GoogleCalendarService,
    private readonly accuLynx: AccuLynxService,
    private readonly knowledgeBase: KnowledgeBaseService,
    private readonly toolDefs: ToolDefinitionsService,
    private readonly pendingActions: PendingActionService,
    private readonly audit: AuditService,
    @Inject(EMAIL_PROVIDER)
    private readonly emailService: IEmailService,
  ) {}

  // ── Public dispatch ───────────────────────────────────────────────────────

  /**
   * Main entry point called by ClaudeTaskOrchestratorService.
   * Routes to the write or read path based on ToolDefinitionsService.isWriteTool().
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    userId: string,
    sessionId: string,
    correlationId?: string,
  ): Promise<unknown> {
    if (this.toolDefs.isWriteTool(toolName)) {
      return this.executeWrite(toolName, args, userId, sessionId, correlationId);
    }
    return this.executeRead(toolName, args, userId, sessionId);
  }

  // ── Write path ────────────────────────────────────────────────────────────

  private async executeWrite(
    toolName: string,
    args: Record<string, unknown>,
    userId: string,
    sessionId: string,
    correlationId?: string,
  ): Promise<unknown> {
    const pendingActionId = args.pendingActionId as string | undefined;

    if (!pendingActionId) {
      // No confirmation token yet — create a pending action record and ask
      const summary = this.buildSummary(toolName, args);
      return this.pendingActions.create({
        userId,
        toolName,
        args,
        summary,
        sessionId,
        correlationId,
      });
    }

    // Confirmation token present — validate and claim it atomically
    const claimResult = await this.pendingActions.claim(pendingActionId, userId);
    if (claimResult.ok === false) {
      return {
        error:  claimResult.message,
        reason: claimResult.reason,
      } satisfies Record<string, unknown>;
    }

    // Execute using the args from the confirmed pending action record
    // (not the AI-supplied args) to prevent prompt-injection tampering.
    const confirmedArgs = claimResult.action.args;

    let result: unknown;
    try {
      result = await this.dispatchWrite(toolName, confirmedArgs, userId, sessionId);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.audit.logWrite({
        action:        this.toolToAuditAction(toolName),
        userId,
        correlationId,
        targetSystem:  this.toolToSystem(toolName),
        argsSnapshot:  this.sanitiseArgs(confirmedArgs),
        resultSummary: `FAILED: ${errMsg}`,
      });
      throw err;
    }

    // Audit success
    const resultSummary = typeof result === 'object' && result !== null
      ? JSON.stringify(result).slice(0, 200)
      : String(result);

    this.audit.logWrite({
      action:        this.toolToAuditAction(toolName),
      userId,
      correlationId,
      targetSystem:  this.toolToSystem(toolName),
      argsSnapshot:  this.sanitiseArgs(confirmedArgs),
      resultSummary,
    });

    await this.pendingActions.recordResult(claimResult.action.id, resultSummary);

    return result;
  }

  private async dispatchWrite(
    toolName: string,
    args: Record<string, unknown>,
    userId: string,
    sessionId: string,
  ): Promise<unknown> {
    switch (toolName) {
      case 'send_email':
        return providerWrite(
          () => this.emailService.sendEmail(
            args.to as string[],
            args.subject as string,
            args.body as string,
            (args.draftOnly as boolean) || false,
            args.cc as string[] | undefined,
            undefined,
            undefined,
            sessionId,
          ),
          'gmail.sendEmail',
        );

      case 'reply_email':
        return providerWrite(
          () => this.gmailService.replyToEmail(
            args.messageId as string,
            args.body as string,
            (args.replyAll as boolean) ?? false,
            userId,
          ),
          'gmail.replyToEmail',
        );

      case 'delete_email':
        return providerWrite(
          () => this.gmailService.deleteEmail(args.messageId as string, userId),
          'gmail.deleteEmail',
        );

      case 'archive_email':
        return providerWrite(
          () => this.gmailService.archiveEmail(args.messageId as string, userId),
          'gmail.archiveEmail',
        );

      case 'create_calendar_event':
        return providerWrite(
          () => this.createCalendarEvent(args, sessionId),
          'calendar.createEvent',
        );

      case 'update_calendar_event':
        return providerWrite(
          () => this.googleCalendar.updateEvent(userId, args.eventId as string, {
            title:       args.title as string,
            startTime:   args.start_time as string,
            endTime:     args.end_time as string,
            description: args.description as string,
            location:    args.location as string,
            attendees:   args.attendees as string[],
          }),
          'calendar.updateEvent',
        );

      case 'delete_calendar_event':
        return providerWrite(
          () => this.googleCalendar.deleteEvent(userId, args.eventId as string),
          'calendar.deleteEvent',
        );

      case 'crm_add_note':
        return providerWrite(
          () => this.accuLynx.addNote(
            args.jobId as string,
            args.note as string,
            args.authorName as string,
          ),
          'acculynx.addNote',
        );

      case 'crm_create_lead':
        return providerWrite(
          () => this.accuLynx.createLead(args as any),
          'acculynx.createLead',
        );

      default:
        return { error: 'Unknown write tool', toolName };
    }
  }

  // ── Read path ─────────────────────────────────────────────────────────────

  private async executeRead(
    toolName: string,
    args: Record<string, unknown>,
    userId: string,
    sessionId: string,
  ): Promise<unknown> {
    switch (toolName) {
      case 'search_knowledge_base':
        return providerRead(
          () => this.searchKnowledgeBase(
            args.query as string,
            args.filter as string | undefined,
            sessionId,
          ),
          'knowledge_base.search',
        );

      case 'read_emails':
        return providerRead(
          () => this.gmailService.readEmails(
            (args.maxResults as number) ?? 20,
            args.query as string | undefined,
            (args.unreadOnly as boolean) ?? false,
            userId,
          ),
          'gmail.readEmails',
        );

      case 'search_emails':
        return providerRead(
          () => this.gmailService.searchEmails(
            args.query as string,
            (args.maxResults as number) ?? 20,
            userId,
          ),
          'gmail.searchEmails',
        );

      case 'get_email':
        return providerRead(
          () => this.gmailService.getEmail(args.messageId as string, userId),
          'gmail.getEmail',
        );

      case 'get_thread':
        return providerRead(
          () => this.gmailService.getThread(args.threadId as string, userId),
          'gmail.getThread',
        );

      case 'list_email_labels':
        return providerRead(
          () => this.gmailService.listLabels(userId),
          'gmail.listLabels',
        );

      case 'mark_email_read':
        // Low-risk write — kept in read path (no confirmation gate)
        return providerWrite(
          () => this.gmailService.markRead(
            args.messageId as string,
            args.read as boolean,
            userId,
          ),
          'gmail.markRead',
        );

      case 'check_calendar':
        return providerRead(
          () => this.checkCalendar(
            args.start_date as string,
            args.end_date as string | undefined,
            args.search_query as string | undefined,
            sessionId,
          ),
          'calendar.checkCalendar',
        );

      case 'search_calendar':
        return providerRead(
          () => this.googleCalendar.searchEvents(
            userId,
            args.query as string,
            (args.maxResults as number) ?? 20,
          ),
          'calendar.searchEvents',
        );

      case 'get_crm_jobs':
        return providerRead(
          () => this.accuLynx.getJobs({
            search:   args.search as string,
            status:   args.status as string,
            page:     args.page as number,
            pageSize: args.pageSize as number,
          }),
          'acculynx.getJobs',
        );

      case 'get_crm_job':
        return providerRead(
          () => this.accuLynx.getJob(args.jobId as string),
          'acculynx.getJob',
        );

      case 'crm_get_contacts':
        return providerRead(
          () => this.accuLynx.getContacts({
            search:   args.search as string,
            page:     args.page as number,
            pageSize: args.pageSize as number,
          }),
          'acculynx.getContacts',
        );

      case 'get_general_info':
        return {
          info:  'No additional information needed. Answer based on general knowledge.',
          query: args.query,
        };

      default:
        this.logger.warn(`Unknown tool called: ${toolName}`);
        return { error: 'Unknown function', toolName };
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async searchKnowledgeBase(
    query: string,
    filter?: string,
    sessionId?: string,
  ): Promise<unknown> {
    this.logger.log(`Searching knowledge base: "${query}" filter=${filter}`);
    const results = await this.knowledgeBase.search(query, 5);

    if (!results.length) {
      return { results: [], message: 'No matching knowledge base entries found.', query };
    }

    return {
      results: results.map(r => ({
        id:         r.id,
        title:      r.title,
        excerpt:    r.content.slice(0, 600) + (r.content.length > 600 ? '…' : ''),
        source:     r.source,
        category:   r.category,
        similarity: r.similarity,
      })),
      message: `Found ${results.length} relevant knowledge base entry(s).`,
      query,
    };
  }

  private async checkCalendar(
    startDate: string,
    endDate?: string,
    searchQuery?: string,
    sessionId?: string,
  ): Promise<unknown> {
    try {
      const userId = sessionId ?? '';
      const status = await this.googleCalendar.getConnectionStatus(userId);
      if (status.connected) {
        const days = endDate
          ? Math.ceil(
              (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000,
            )
          : 1;
        return this.googleCalendar.getUpcomingEvents(userId, Math.max(days, 1));
      }
    } catch { /* fall through to CalendarService */ }

    return this.calendarService.checkCalendar(startDate, endDate, searchQuery, sessionId);
  }

  private async createCalendarEvent(
    args: Record<string, unknown>,
    sessionId?: string,
  ): Promise<unknown> {
    try {
      const userId = sessionId ?? '';
      const status = await this.googleCalendar.getConnectionStatus(userId);
      if (status.connected) {
        return this.googleCalendar.createEvent(
          userId,
          args.title as string,
          args.start_time as string,
          args.end_time as string,
          args.description as string,
          args.location as string,
          args.attendees as string[],
        );
      }
    } catch { /* fall through to CalendarService */ }

    return this.calendarService.createCalendarEvent(
      args.title as string,
      args.start_time as string,
      args.end_time as string,
      args.description as string,
      args.attendees as string[],
      args.location as string,
      sessionId,
    );
  }

  private buildSummary(toolName: string, args: Record<string, unknown>): string {
    switch (toolName) {
      case 'send_email':
        return `Send email to ${(args.to as string[])?.join(', ')} — subject: "${args.subject}"`;
      case 'reply_email':
        return `Reply to message ${args.messageId}`;
      case 'delete_email':
        return `Move email ${args.messageId} to trash`;
      case 'archive_email':
        return `Archive email ${args.messageId}`;
      case 'create_calendar_event':
        return `Create event "${args.title}" on ${args.start_time}`;
      case 'update_calendar_event':
        return `Update calendar event ${args.eventId}`;
      case 'delete_calendar_event':
        return `Delete calendar event ${args.eventId}`;
      case 'crm_add_note':
        return `Add note to CRM job ${args.jobId}`;
      case 'crm_create_lead':
        return `Create CRM lead for ${args.firstName} ${args.lastName}`;
      default:
        return `Execute ${toolName}`;
    }
  }

  private toolToAuditAction(
    toolName: string,
  ): import('../audit/audit.service').AuditAction {
    const map: Record<string, import('../audit/audit.service').AuditAction> = {
      send_email:             'email_send',
      reply_email:            'email_reply',
      delete_email:           'email_delete',
      archive_email:          'email_archive',
      create_calendar_event:  'calendar_event_create',
      update_calendar_event:  'calendar_event_update',
      delete_calendar_event:  'calendar_event_delete',
      crm_add_note:           'crm_note_add',
      crm_create_lead:        'crm_lead_create',
    };
    return map[toolName] ?? 'knowledge_base_write';
  }

  private toolToSystem(toolName: string): string {
    if (toolName.includes('email'))                       return 'gmail';
    if (toolName.includes('calendar'))                    return 'google_calendar';
    if (toolName.startsWith('crm'))                       return 'acculynx';
    if (toolName === 'search_knowledge_base')             return 'knowledge_base';
    return 'unknown';
  }

  /** Strip secrets before storing in audit logs */
  private sanitiseArgs(args: Record<string, unknown>): Record<string, unknown> {
    const {
      password, token, accessToken, refreshToken, pendingActionId,
      ...safe
    } = args as any;
    return safe;
  }
}
