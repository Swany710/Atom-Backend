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
        description: 'Search company knowledge base for SOPs, product info, FAQs, documents, and notes.',
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
        description: 'Create a new lead in AccuLynx. REQUIRE confirmation before calling.',
        input_schema: {
          type: 'object' as const,
          properties: {
            firstName:       { type: 'string' },
            lastName:        { type: 'string' },
            email:           { type: 'string' },
            phone:           { type: 'string' },
            address:         { type: 'string' },
            notes:           { type: 'string' },
            pendingActionId: { type: 'string' },
          },
          required: ['firstName', 'lastName'],
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

  /** Names of tools that mutate external state and require confirmation */
  static readonly WRITE_TOOLS = new Set([
    'send_email',
    'reply_email',
    'delete_email',
    'archive_email',
    'create_calendar_event',
    'update_calendar_event',
    'delete_calendar_event',
    'crm_add_note',
    'crm_create_lead',
  ]);

  isWriteTool(name: string): boolean {
    return ToolDefinitionsService.WRITE_TOOLS.has(name);
  }
}
