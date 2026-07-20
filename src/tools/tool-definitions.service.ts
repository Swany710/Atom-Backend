import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

/**
 * ToolDefinitionsService
 *
 * Single source of truth for every Anthropic tool schema the AI can invoke.
 * Separating definitions from execution keeps the tool list easy to audit
 * and change without touching orchestration or execution logic.
 */
@Injectable()
export class ToolDefinitionsService {
  getTools(): Anthropic.Messages.Tool[] {
    return [
      // ── Knowledge Base ──────────────────────────────────────────────
      {
        name: 'search_knowledge_base',
        description: 'Search the company knowledge base: manufacturer product spec library (data sheets + installation guides), SOPs, FAQs, documents, and notes. ALWAYS use this FIRST for any product-specific question (specs, ratings, installation steps, warranties) before answering from general knowledge.',
        input_schema: {
          type: 'object' as const,
          properties: {
            query:  { type: 'string' },
            filter: { type: 'string' },
          },
          required: ['query'],
        },
      },

      // ── Email — READ ────────────────────────────────────────────────
      {
        name: 'read_emails',
        description: 'List recent emails from Gmail inbox. Use to get a summary of messages, check for unread mail, or browse recent conversations.',
        input_schema: {
          type: 'object' as const,
          properties: {
            maxResults:  { type: 'number',  description: 'Number of emails to fetch (default 20)' },
            query:       { type: 'string',  description: 'Gmail search query (e.g. "is:unread", "from:boss@co.com")' },
            unreadOnly:  { type: 'boolean', description: 'Only fetch unread emails' },
          },
          required: [],
        },
      },
      {
        name: 'search_emails',
        description: 'Search Gmail using a query string. Supports Gmail operators: from:, to:, subject:, is:unread, has:attachment, after:2024/1/1, etc.',
        input_schema: {
          type: 'object' as const,
          properties: {
            query:      { type: 'string', description: 'Gmail search query' },
            maxResults: { type: 'number', description: 'Max results (default 20)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_email',
        description: 'Get the full body and details of a specific email by its message ID.',
        input_schema: {
          type: 'object' as const,
          properties: { messageId: { type: 'string', description: 'Gmail message ID' } },
          required: ['messageId'],
        },
      },
      {
        name: 'get_thread',
        description: 'Get all messages in an email thread/conversation.',
        input_schema: {
          type: 'object' as const,
          properties: { threadId: { type: 'string', description: 'Gmail thread ID' } },
          required: ['threadId'],
        },
      },
      {
        name: 'list_email_labels',
        description: 'List available Gmail labels/folders.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
      },

      // ── Email — WRITE (require backend confirmation) ────────────────
      {
        name: 'send_email',
        description: 'Send an email. REQUIRE confirmation before calling. Pass pendingActionId if user has confirmed.',
        input_schema: {
          type: 'object' as const,
          properties: {
            to:              { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
            subject:         { type: 'string', description: 'Subject line' },
            body:            { type: 'string', description: 'Email body (plain text)' },
            cc:              { type: 'array', items: { type: 'string' } },
            draftOnly:       { type: 'boolean', description: 'Save as draft only, do not send' },
            pendingActionId: { type: 'string', description: 'ID from pending action confirmation' },
          },
          required: ['to', 'subject', 'body'],
        },
      },
      {
        name: 'reply_email',
        description: 'Reply to an existing email. REQUIRE confirmation before calling.',
        input_schema: {
          type: 'object' as const,
          properties: {
            messageId:       { type: 'string', description: 'Gmail message ID to reply to' },
            body:            { type: 'string', description: 'Reply body text' },
            replyAll:        { type: 'boolean', description: 'Reply-all (default false)' },
            pendingActionId: { type: 'string', description: 'ID from pending action confirmation' },
          },
          required: ['messageId', 'body'],
        },
      },
      {
        name: 'delete_email',
        description: 'Move an email to trash. REQUIRE confirmation before calling.',
        input_schema: {
          type: 'object' as const,
          properties: {
            messageId:       { type: 'string' },
            pendingActionId: { type: 'string' },
          },
          required: ['messageId'],
        },
      },
      {
        name: 'archive_email',
        description: 'Archive an email (remove from inbox). REQUIRE confirmation before calling.',
        input_schema: {
          type: 'object' as const,
          properties: {
            messageId:       { type: 'string' },
            pendingActionId: { type: 'string' },
          },
          required: ['messageId'],
        },
      },
      {
        name: 'mark_email_read',
        description: 'Mark an email as read or unread.',
        input_schema: {
          type: 'object' as const,
          properties: {
            messageId: { type: 'string' },
            read:      { type: 'boolean', description: 'true = mark read, false = mark unread' },
          },
          required: ['messageId', 'read'],
        },
      },

      // ── Calendar — READ ─────────────────────────────────────────────
      {
        name: 'check_calendar',
        description: 'Get upcoming calendar events for a date range.',
        input_schema: {
          type: 'object' as const,
          properties: {
            start_date:   { type: 'string', description: 'Start date (ISO 8601)' },
            end_date:     { type: 'string', description: 'End date (ISO 8601)' },
            search_query: { type: 'string', description: 'Optional text search within events' },
          },
          required: ['start_date'],
        },
      },
      {
        name: 'search_calendar',
        description: 'Search Google Calendar events by keyword.',
        input_schema: {
          type: 'object' as const,
          properties: {
            query:      { type: 'string' },
            maxResults: { type: 'number' },
          },
          required: ['query'],
        },
      },

      // ── Calendar — WRITE (require backend confirmation) ─────────────
      {
        name: 'create_calendar_event',
        description: 'Create a new calendar event. REQUIRE confirmation before calling.',
        input_schema: {
          type: 'object' as const,
          properties: {
            title:           { type: 'string' },
            start_time:      { type: 'string', description: 'ISO 8601 datetime' },
            end_time:        { type: 'string', description: 'ISO 8601 datetime' },
            description:     { type: 'string' },
            location:        { type: 'string' },
            attendees:       { type: 'array', items: { type: 'string' }, description: 'Email addresses' },
            pendingActionId: { type: 'string' },
          },
          required: ['title', 'start_time', 'end_time'],
        },
      },
      {
        name: 'update_calendar_event',
        description: 'Update an existing calendar event. REQUIRE confirmation before calling.',
        input_schema: {
          type: 'object' as const,
          properties: {
            eventId:         { type: 'string' },
            title:           { type: 'string' },
            start_time:      { type: 'string' },
            end_time:        { type: 'string' },
            description:     { type: 'string' },
            location:        { type: 'string' },
            attendees:       { type: 'array', items: { type: 'string' } },
            pendingActionId: { type: 'string' },
          },
          required: ['eventId'],
        },
      },
      {
        name: 'delete_calendar_event',
        description: 'Delete a calendar event. REQUIRE confirmation before calling.',
        input_schema: {
          type: 'object' as const,
          properties: {
            eventId:         { type: 'string' },
            pendingActionId: { type: 'string' },
          },
          required: ['eventId'],
        },
      },

      // ── CRM — READ ──────────────────────────────────────────────────
      {
        name: 'get_crm_jobs',
        description: 'List AccuLynx jobs/projects with optional search and status filter.',
        input_schema: {
          type: 'object' as const,
          properties: {
            search:   { type: 'string' },
            status:   { type: 'string' },
            page:     { type: 'number' },
            pageSize: { type: 'number' },
          },
          required: [],
        },
      },
      {
        name: 'get_crm_job',
        description: 'Get full details of a specific AccuLynx job.',
        input_schema: {
          type: 'object' as const,
          properties: { jobId: { type: 'string' } },
          required: ['jobId'],
        },
      },
      {
        name: 'crm_get_contacts',
        description: 'Search AccuLynx contacts.',
        input_schema: {
          type: 'object' as const,
          properties: {
            search:   { type: 'string' },
            page:     { type: 'number' },
            pageSize: { type: 'number' },
          },
          required: [],
        },
      },

      // ── CRM — WRITE (require backend confirmation) ──────────────────
      {
        name: 'crm_add_note',
        description: 'Add a note to an AccuLynx job. REQUIRE confirmation before calling.',
        input_schema: {
          type: 'object' as const,
          properties: {
            jobId:           { type: 'string' },
            note:            { type: 'string' },
            authorName:      { type: 'string' },
            pendingActionId: { type: 'string' },
          },
          required: ['jobId', 'note'],
        },
      },
      {
        name: 'crm_create_lead',
        description:
          'Create a new lead/job in AccuLynx. REQUIRE confirmation before calling. ' +
          'Collect as much as the user knows: customer name, phone, email, full job address ' +
          '(street, city, state, zip), and the job details — trade type(s) (e.g. Roofing, Siding, ' +
          'Gutters, Windows), work type (e.g. Insurance, Retail, Repair, New, Inspection), ' +
          'job category (e.g. Residential, Commercial), priority (Normal/High/Urgent), lead source, ' +
          'and any notes. Pass names as plain text — they are matched to the company\'s AccuLynx ' +
          'settings automatically. Only firstName/lastName are required; create the lead with ' +
          'whatever the user has rather than blocking on missing fields. The new job is ' +
          'auto-assigned to the requesting user\'s AccuLynx account.',
        input_schema: {
          type: 'object' as const,
          properties: {
            firstName:   { type: 'string' },
            lastName:    { type: 'string' },
            email:       { type: 'string' },
            phone:       { type: 'string', description: '10-digit US phone' },
            address:     { type: 'string', description: 'street address' },
            city:        { type: 'string' },
            state:       { type: 'string', description: '2-letter state, e.g. MN' },
            zip:         { type: 'string' },
            priority:    { type: 'string', enum: ['Normal', 'High', 'Urgent'] },
            jobCategory: { type: 'string', description: 'e.g. Residential, Commercial' },
            workType:    { type: 'string', description: 'e.g. Insurance, Repair, New' },
            tradeTypes:  { type: 'array', items: { type: 'string' }, description: 'e.g. ["Roofing","Siding"]' },
            leadSource:  { type: 'string', description: 'how the lead found the company' },
            notes:           { type: 'string' },
            pendingActionId: { type: 'string' },
          },
          required: ['firstName', 'lastName'],
        },
      },

      // ── Scheduled Tasks ─────────────────────────────────────────────
      {
        name: 'schedule_task',
        description:
          'Schedule a future action to be executed automatically at a specific date and time. ' +
          'Use when the user says things like "send a reminder email at 3pm Friday", ' +
          '"email the homeowner tomorrow morning", or "remind me to follow up on Monday". ' +
          'Supported taskTypes: send_email. ' +
          'scheduledAt must be an ISO 8601 datetime string (e.g. "2025-06-15T15:00:00-05:00"). ' +
          'When the user mentions a day/time without a year, infer the next upcoming occurrence.',
        input_schema: {
          type: 'object' as const,
          properties: {
            taskType: {
              type: 'string',
              description: 'The type of action to schedule. Currently supported: send_email',
            },
            description: {
              type: 'string',
              description: 'Human-readable summary of the task, e.g. "Send reminder email to John Smith about roof inspection"',
            },
            scheduledAt: {
              type: 'string',
              description: 'ISO 8601 datetime when to execute the task, including timezone offset (e.g. "2025-06-15T15:00:00-05:00" for 3pm CT)',
            },
            args: {
              type: 'object' as const,
              description:
                'Arguments for the task. For send_email: { to: string[], subject: string, body: string, cc?: string[] }',
              properties: {
                to:      { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
                subject: { type: 'string', description: 'Email subject line' },
                body:    { type: 'string', description: 'Email body (plain text)' },
                cc:      { type: 'array', items: { type: 'string' }, description: 'CC recipients (optional)' },
              },
            },
          },
          required: ['taskType', 'description', 'scheduledAt', 'args'],
        },
      },
      {
        name: 'list_scheduled_tasks',
        description:
          'List all scheduled (future) tasks for the current user. ' +
          'Use when the user asks "what do I have scheduled?", "show my reminders", or similar.',
        input_schema: {
          type: 'object' as const,
          properties: {
            pendingOnly: {
              type: 'boolean',
              description: 'If true, only return pending (not yet executed) tasks. Default false.',
            },
          },
          required: [],
        },
      },
      {
        name: 'cancel_scheduled_task',
        description: 'Cancel a pending scheduled task by its ID. Use when the user wants to remove or cancel a scheduled reminder.',
        input_schema: {
          type: 'object' as const,
          properties: {
            taskId: { type: 'string', description: 'The ID of the scheduled task to cancel' },
          },
          required: ['taskId'],
        },
      },

      // ── Personal notes ─────────────────────────────────────────────
      {
        name: 'create_note',
        description: 'Save a personal note for the user. Use whenever the user says things like "note that...", "make a note...", "write this down", "remember for later". Saves INSTANTLY — no confirmation needed. Confirm to the user after saving.',
        input_schema: {
          type: 'object' as const,
          properties: {
            content: { type: 'string', description: 'The note text' },
            title:   { type: 'string', description: 'Optional short title' },
          },
          required: ['content'],
        },
      },
      {
        name: 'list_notes',
        description: "List or search the user's saved personal notes.",
        input_schema: {
          type: 'object' as const,
          properties: {
            search: { type: 'string', description: 'Optional text filter' },
            limit:  { type: 'number', description: 'Max notes to return (default 20)' },
          },
        },
      },
      {
        name: 'delete_note',
        description: 'Delete one of the user\'s personal notes by id (get the id from list_notes). REQUIRE confirmation before calling.',
        input_schema: {
          type: 'object' as const,
          properties: {
            noteId: { type: 'string', description: 'The id of the note to delete' },
          },
          required: ['noteId'],
        },
      },

      // ── General ────────────────────────────────────────────────────
      {
        name: 'get_general_info',
        description: 'Get general information or answer questions using built-in knowledge.',
        input_schema: {
          type: 'object' as const,
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    ];
  }

  /**
   * Tools that mutate external state and require user confirmation before
   * executing.  Low-risk organisational actions (delete_email, archive_email,
   * mark_email_read) are intentionally excluded so the user can manage their
   * inbox without an extra confirmation step.
   */
  static readonly WRITE_TOOLS = new Set([
    'send_email',
    'reply_email',
    'create_calendar_event',
    'update_calendar_event',
    'delete_calendar_event',
    'crm_add_note',
    'crm_create_lead',
    // create_note is deliberately NOT here — personal notes save instantly
    // (user preference); deleting a note still requires confirmation.
    'delete_note',
  ]);

  isWriteTool(name: string): boolean {
    return ToolDefinitionsService.WRITE_TOOLS.has(name);
  }
}
