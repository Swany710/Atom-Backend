import { Inject, Injectable, Logger } from '@nestjs/common';
import { EMAIL_PROVIDER, IEmailService } from '../integrations/email/email.provider';
import { EmailService as EmailRouterService } from '../integrations/email/email.service';
import { OutlookTransport } from '../integrations/email/outlook.transport';
import { GmailService } from '../integrations/email/gmail.service';
import { CalendarService } from '../integrations/calendar/calendar.service';
import { GoogleCalendarService } from '../integrations/calendar/google-calendar.service';
import { OutlookCalendarService } from '../integrations/calendar/outlook-calendar.service';
import { AccuLynxService } from '../integrations/crm/acculynx.service';
import { CrmAccessPolicyService } from '../integrations/crm/crm-access-policy.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { NotesService } from '../notes/notes.service';
import { ToolDefinitionsService } from './tool-definitions.service';
import { PendingActionService, ConfirmationRequired } from '../pending-actions/pending-action.service';
import { AuditService } from '../audit/audit.service';
import { providerRead, providerWrite } from '../utils/provider-call';
import { ScheduledTaskService } from '../scheduled-tasks/scheduled-task.service';

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
    private readonly crmPolicy: CrmAccessPolicyService,
    private readonly knowledgeBase: KnowledgeBaseService,
    private readonly notes: NotesService,
    private readonly toolDefs: ToolDefinitionsService,
    private readonly pendingActions: PendingActionService,
    private readonly audit: AuditService,
    private readonly scheduledTasks: ScheduledTaskService,
    @Inject(EMAIL_PROVIDER)
    private readonly emailService: IEmailService,
    // Provider-aware router: resolves per-user which email account is
    // connected (gmail | outlook) and delegates to the matching transport.
    private readonly emailRouter: EmailRouterService,
    private readonly outlookTransport: OutlookTransport,
    private readonly outlookCalendar: OutlookCalendarService,
  ) {}

  /**
   * Which calendar should this user's calendar tools hit?
   *   1. Google Calendar if they connected Google (existing behavior)
   *   2. Their Outlook calendar if they connected Outlook
   *   3. The env-credential Microsoft fallback (CalendarService) otherwise
   */
  private async calendarProviderFor(userId: string): Promise<'google' | 'outlook' | 'fallback'> {
    try {
      const status = await this.googleCalendar.getConnectionStatus(userId);
      if (status.connected) return 'google';
    } catch { /* fall through */ }
    try {
      if (await this.outlookCalendar.hasConnection(userId)) return 'outlook';
    } catch { /* fall through */ }
    return 'fallback';
  }

  /**
   * Which email provider did THIS user connect?
   * Email tools used to be hardwired to GmailService, which made Outlook
   * connections invisible — users connected Outlook and still got
   * "Gmail is not connected" errors.
   */
  private async userEmailProvider(userId: string): Promise<'gmail' | 'outlook'> {
    try {
      return await this.emailRouter.getActiveProvider(userId);
    } catch {
      return 'gmail'; // conservative fallback: previous hardwired behavior
    }
  }


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
      case 'send_email': {
        const provider = await this.userEmailProvider(userId);
        if (provider === 'outlook') {
          return providerWrite(
            () => this.emailRouter.sendEmail(
              args.to as string[],
              args.subject as string,
              args.body as string,
              (args.draftOnly as boolean) || false,
              args.cc as string[] | undefined,
              undefined,
              undefined,
              userId,
              'outlook',
            ),
            'outlook.sendEmail',
          );
        }
        return providerWrite(
          () => this.emailService.sendEmail(
            args.to as string[],
            args.subject as string,
            args.body as string,
            (args.draftOnly as boolean) || false,
            args.cc as string[] | undefined,
            undefined,
            undefined,
            userId,   // ← was sessionId (conversation ID); must be the auth user ID
          ),
          'gmail.sendEmail',
        );
      }

      case 'reply_email': {
        const provider = await this.userEmailProvider(userId);
        if (provider === 'outlook') {
          return providerWrite(
            () => this.emailRouter.replyToEmail(
              args.messageId as string,
              args.body as string,
              (args.replyAll as boolean) ?? false,
              userId,
              'outlook',
            ),
            'outlook.replyToEmail',
          );
        }
        return providerWrite(
          () => this.gmailService.replyToEmail(
            args.messageId as string,
            args.body as string,
            (args.replyAll as boolean) ?? false,
            userId,
          ),
          'gmail.replyToEmail',
        );
      }

      case 'create_calendar_event':
        return providerWrite(
          () => this.createCalendarEvent(args, userId, sessionId),
          'calendar.createEvent',
        );

      case 'update_calendar_event': {
        const calProvider = await this.calendarProviderFor(userId);
        if (calProvider === 'outlook') {
          return providerWrite(
            () => this.outlookCalendar.updateEvent(userId, args.eventId as string, {
              title:       args.title as string,
              startTime:   args.start_time as string,
              endTime:     args.end_time as string,
              description: args.description as string,
              location:    args.location as string,
              attendees:   args.attendees as string[],
            }),
            'outlookCalendar.updateEvent',
          );
        }
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
      }

      case 'delete_calendar_event': {
        const calProvider = await this.calendarProviderFor(userId);
        if (calProvider === 'outlook') {
          return providerWrite(
            () => this.outlookCalendar.deleteEvent(userId, args.eventId as string),
            'outlookCalendar.deleteEvent',
          );
        }
        return providerWrite(
          () => this.googleCalendar.deleteEvent(userId, args.eventId as string),
          'calendar.deleteEvent',
        );
      }

      case 'crm_add_note': {
        // CRM-ACCESS-POLICY: members can only touch their assigned jobs
        const denied = await this.crmPolicy.checkJobAccess(args.jobId as string);
        if (denied) return denied;
        return providerWrite(
          () => this.accuLynx.addNote(
            args.jobId as string,
            args.note as string,
            args.authorName as string,
          ),
          'acculynx.addNote',
        );
      }

      case 'crm_create_lead': {
        const denied = await this.crmPolicy.checkCrmAccess();
        if (denied) return denied;
        // Auto-assign the new lead to the creator's mapped AccuLynx user
        const assignToAcculynxUserId = await this.crmPolicy.callerAcculynxUserId();
        return providerWrite(
          () => this.accuLynx.createLead({ ...(args as any), assignToAcculynxUserId }),
          'acculynx.createLead',
        );
      }

      case 'delete_note':
        return providerWrite(
          () => this.notes.delete(userId, args.noteId as string),
          'notes.delete',
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

      // ── Personal notes ────────────────────────────────────────────────
      // create_note executes on the read path DELIBERATELY: personal notes
      // save instantly without the confirmation gate (user preference).
      // It is still audited below. delete_note goes through the write path.
      case 'create_note': {
        const result = await this.notes.create(
          userId,
          args.content as string,
          args.title as string | undefined,
        );
        this.audit.logWrite({
          action:        'note_create',
          userId,
          targetSystem:  'notes',
          argsSnapshot:  this.sanitiseArgs(args),
          resultSummary: result.success ? `Note saved: ${result.note?.id}` : `FAILED: ${result.error}`,
        });
        return result;
      }

      case 'list_notes':
        return this.notes.list(userId, {
          search: args.search as string | undefined,
          limit:  (args.limit as number) ?? 20,
        });

      case 'read_emails': {
        const provider = await this.userEmailProvider(userId);
        if (provider === 'outlook') {
          return providerRead(
            () => this.emailRouter.readEmails(
              (args.maxResults as number) ?? 20,
              args.query as string | undefined,
              (args.unreadOnly as boolean) ?? false,
              userId,
              'outlook',
            ),
            'outlook.readEmails',
          );
        }
        return providerRead(
          () => this.gmailService.readEmails(
            (args.maxResults as number) ?? 20,
            args.query as string | undefined,
            (args.unreadOnly as boolean) ?? false,
            userId,
          ),
          'gmail.readEmails',
        );
      }

      case 'search_emails': {
        const provider = await this.userEmailProvider(userId);
        if (provider === 'outlook') {
          return providerRead(
            () => this.emailRouter.searchEmails(
              args.query as string,
              (args.maxResults as number) ?? 20,
              userId,
              'outlook',
            ),
            'outlook.searchEmails',
          );
        }
        return providerRead(
          () => this.gmailService.searchEmails(
            args.query as string,
            (args.maxResults as number) ?? 20,
            userId,
          ),
          'gmail.searchEmails',
        );
      }

      case 'get_email': {
        if (await this.userEmailProvider(userId) === 'outlook') {
          return providerRead(
            () => this.outlookTransport.getEmail(userId, args.messageId as string),
            'outlook.getEmail',
          );
        }
        return providerRead(
          () => this.gmailService.getEmail(args.messageId as string, userId),
          'gmail.getEmail',
        );
      }

      case 'get_thread': {
        if (await this.userEmailProvider(userId) === 'outlook') {
          return providerRead(
            () => this.outlookTransport.getThread(userId, args.threadId as string),
            'outlook.getThread',
          );
        }
        return providerRead(
          () => this.gmailService.getThread(args.threadId as string, userId),
          'gmail.getThread',
        );
      }

      case 'list_email_labels': {
        if (await this.userEmailProvider(userId) === 'outlook') {
          return providerRead(
            () => this.outlookTransport.listFolders(userId),
            'outlook.listFolders',
          );
        }
        return providerRead(
          () => this.gmailService.listLabels(userId),
          'gmail.listLabels',
        );
      }

      case 'mark_email_read': {
        // Low-risk write — direct execute, no confirmation gate
        const provider = await this.userEmailProvider(userId);
        if (provider === 'outlook') {
          return providerWrite(
            () => this.emailRouter.markEmail(
              args.messageId as string,
              args.read as boolean,
              userId,
              'outlook',
            ),
            'outlook.markEmail',
          );
        }
        return providerWrite(
          () => this.gmailService.markRead(
            args.messageId as string,
            args.read as boolean,
            userId,
          ),
          'gmail.markRead',
        );
      }

      case 'delete_email': {
        // Organisational action — direct execute, no confirmation gate
        const provider = await this.userEmailProvider(userId);
        if (provider === 'outlook') {
          return providerWrite(
            () => this.emailRouter.deleteEmail(
              args.messageId as string,
              false,
              userId,
              'outlook',
            ),
            'outlook.deleteEmail',
          );
        }
        return providerWrite(
          () => this.gmailService.deleteEmail(args.messageId as string, userId),
          'gmail.deleteEmail',
        );
      }

      case 'archive_email': {
        // Organisational action — direct execute, no confirmation gate
        if (await this.userEmailProvider(userId) === 'outlook') {
          return providerWrite(
            () => this.outlookTransport.archive(userId, args.messageId as string),
            'outlook.archiveEmail',
          );
        }
        return providerWrite(
          () => this.gmailService.archiveEmail(args.messageId as string, userId),
          'gmail.archiveEmail',
        );
      }

      case 'check_calendar':
        return providerRead(
          () => this.checkCalendar(
            args.start_date as string,
            args.end_date as string | undefined,
            args.search_query as string | undefined,
            userId,      // ← was sessionId; must be the auth user ID for OAuth lookup
            sessionId,
          ),
          'calendar.checkCalendar',
        );

      case 'search_calendar': {
        const calProvider = await this.calendarProviderFor(userId);
        if (calProvider === 'outlook') {
          return providerRead(
            () => this.outlookCalendar.searchEvents(
              userId,
              args.query as string,
              (args.maxResults as number) ?? 20,
            ),
            'outlookCalendar.searchEvents',
          );
        }
        return providerRead(
          () => this.googleCalendar.searchEvents(
            userId,
            args.query as string,
            (args.maxResults as number) ?? 20,
          ),
          'calendar.searchEvents',
        );
      }

      case 'get_crm_jobs': {
        // CRM-ACCESS-POLICY: members see only their assigned jobs
        const denied = await this.crmPolicy.checkCrmAccess();
        if (denied) return denied;
        return providerRead(
          async () => this.crmPolicy.filterJobList(
            await this.accuLynx.getJobs({
              search:   args.search as string,
              status:   args.status as string,
              page:     args.page as number,
              pageSize: args.pageSize as number,
            }),
          ),
          'acculynx.getJobs',
        );
      }

      case 'get_crm_job': {
        const denied = await this.crmPolicy.checkJobAccess(args.jobId as string);
        if (denied) return denied;
        return providerRead(
          () => this.accuLynx.getJob(args.jobId as string),
          'acculynx.getJob',
        );
      }

      case 'crm_get_contacts': {
        const denied = await this.crmPolicy.checkCrmAccess();
        if (denied) return denied;
        return providerRead(
          () => this.accuLynx.getContacts({
            search:   args.search as string,
            page:     args.page as number,
            pageSize: args.pageSize as number,
          }),
          'acculynx.getContacts',
        );
      }

      case 'get_general_info':
        return {
          info:  'No additional information needed. Answer based on general knowledge.',
          query: args.query,
        };

      // ── Scheduled Tasks ─────────────────────────────────────────
      case 'schedule_task': {
        const scheduledAt = new Date(args.scheduledAt as string);
        if (isNaN(scheduledAt.getTime())) {
          return { error: 'Invalid scheduledAt datetime. Use ISO 8601 format.' };
        }
        if (scheduledAt <= new Date()) {
          return { error: 'scheduledAt must be in the future.' };
        }
        const task = await this.scheduledTasks.create({
          userId:      userId,
          taskType:    args.taskType as string,
          description: args.description as string,
          scheduledAt,
          args:        args.args as Record<string, unknown>,
        });
        return {
          success:     true,
          taskId:      task.id,
          description: task.description,
          scheduledAt: task.scheduledAt.toISOString(),
          message:     `Scheduled: "${task.description}" for ${task.scheduledAt.toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`,
        };
      }

      case 'list_scheduled_tasks': {
        const pendingOnly = args.pendingOnly as boolean | undefined;
        const tasks = pendingOnly
          ? await this.scheduledTasks.listPending(userId)
          : await this.scheduledTasks.list(userId);
        return {
          tasks: tasks.map(t => ({
            id:          t.id,
            taskType:    t.taskType,
            description: t.description,
            scheduledAt: t.scheduledAt.toISOString(),
            status:      t.status,
            resultSummary: t.resultSummary,
          })),
          count: tasks.length,
        };
      }

      case 'cancel_scheduled_task': {
        const result = await this.scheduledTasks.cancel(args.taskId as string, userId);
        return result;
      }

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
        // 4000 chars ≈ a full chunked spec/install-guide section. The old
        // 600-char excerpt cut off spec tables mid-row, forcing the LLM to
        // guess — exactly what the KB is meant to prevent.
        excerpt:    r.content.slice(0, 4000) + (r.content.length > 4000 ? '…' : ''),
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
    userId?: string,    // ← auth user ID for OAuth lookup
    sessionId?: string,
  ): Promise<unknown> {
    const uid = userId ?? '';
    const days = endDate
      ? Math.ceil(
          (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000,
        )
      : 1;

    try {
      const status = await this.googleCalendar.getConnectionStatus(uid);
      if (status.connected) {
        return this.googleCalendar.getUpcomingEvents(uid, Math.max(days, 1));
      }
    } catch { /* fall through */ }

    // User connected Outlook → use THEIR calendar via their OAuth token
    try {
      if (await this.outlookCalendar.hasConnection(uid)) {
        return this.outlookCalendar.getUpcomingEvents(uid, Math.max(days, 1));
      }
    } catch { /* fall through to CalendarService */ }

    return this.calendarService.checkCalendar(startDate, endDate, searchQuery, sessionId);
  }

  private async createCalendarEvent(
    args: Record<string, unknown>,
    userId?: string,    // ← auth user ID for OAuth lookup
    sessionId?: string,
  ): Promise<unknown> {
    const uid = userId ?? '';

    try {
      const status = await this.googleCalendar.getConnectionStatus(uid);
      if (status.connected) {
        return this.googleCalendar.createEvent(
          uid,
          args.title as string,
          args.start_time as string,
          args.end_time as string,
          args.description as string,
          args.location as string,
          args.attendees as string[],
        );
      }
    } catch { /* fall through */ }

    // User connected Outlook → create on THEIR calendar via their OAuth token
    try {
      if (await this.outlookCalendar.hasConnection(uid)) {
        return this.outlookCalendar.createEvent(
          uid,
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
      case 'delete_note':
        return `Delete personal note ${args.noteId}`;
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
      delete_note:            'note_delete',
    };
    return map[toolName] ?? 'knowledge_base_write';
  }

  private toolToSystem(toolName: string): string {
    if (toolName.includes('email'))                       return 'gmail';
    if (toolName.includes('calendar'))                    return 'google_calendar';
    if (toolName.includes('crm'))                         return 'acculynx';  // covers crm_* AND get_crm_* (before the notes check — crm_add_note is CRM)
    if (toolName.endsWith('_note') || toolName === 'list_notes') return 'notes';
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
