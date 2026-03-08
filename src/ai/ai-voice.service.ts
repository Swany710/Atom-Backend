import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { EMAIL_PROVIDER, IEmailService } from '../integrations/email/email.provider';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMemory } from './chat-memory.entity';
import { GmailService } from '../integrations/email/gmail.service';
import { CalendarService } from '../integrations/calendar/calendar.service';
import { GoogleCalendarService } from '../integrations/calendar/google-calendar.service';
import { AccuLynxService } from '../integrations/crm/acculynx.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import * as path from 'path';
import * as os from 'os';
import { writeFile, unlink } from 'fs/promises';
import { createReadStream } from 'fs';

interface ProcessResult {
  response: string;
  conversationId: string;
  transcription?: string;
  audioResponse?: Buffer;
  toolCalls?: Array<{ tool: string; args: any; result: any }>;
}

@Injectable()
export class AIVoiceService {
  private readonly openai: OpenAI;
  private readonly anthropic: Anthropic;
  private readonly logger = new Logger(AIVoiceService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(ChatMemory)
    private readonly chatRepo: Repository<ChatMemory>,
    private readonly gmailService: GmailService,
    private readonly calendarService: CalendarService,
    private readonly googleCalendar: GoogleCalendarService,
    private readonly accuLynx: AccuLynxService,
    private readonly knowledgeBase: KnowledgeBaseService,
    @Inject(EMAIL_PROVIDER)
    private readonly emailService: IEmailService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
    this.anthropic = new Anthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  /* ---------------------------------------------------------------------
   *  Chat helpers
   * ------------------------------------------------------------------- */
  private get systemPrompt(): string {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return `You are Atom, an AI personal assistant for a roofing and contracting business. You are proactive, organized, and operate like a world-class executive assistant. Today is ${today}.

You have full access to the user's:
  • Gmail — read, search, summarize, reply, send, draft, delete, archive, mark read/unread
  • Google Calendar — view, search, create, edit, delete events
  • AccuLynx CRM — view jobs, contacts, leads; add notes; create leads
  • Company Knowledge Base — search for SOPs, company info, product details, FAQs
  • General reasoning — summarize, prioritize, plan, answer questions

════════════════════════════════════════════
HOW TO BEHAVE AS A PERSONAL ASSISTANT
════════════════════════════════════════════
• Be proactive and thorough. When asked to "check my email", pull 10–20 emails and give a smart summary: who needs a reply, any urgent items, any patterns.
• When asked to "prioritize my day", check BOTH calendar and email, then give a clear, ordered action plan.
• When summarizing, always include: sender, subject, key ask, and urgency level.
• When searching email, use smart Gmail query syntax (from:, subject:, is:unread, after:, etc.).
• For calendar, always confirm timezone and show full event details.
• Chain tools together. e.g. "What's on my plate?" → check calendar + read emails + summarize everything.
• If the user says something vague, interpret it helpfully and do the most useful thing.

════════════════════════════════════════════
CONFIRMATION RULE — MANDATORY FOR WRITE ACTIONS
════════════════════════════════════════════
Always confirm BEFORE calling these tools:
  • send_email / reply_email
  • create_calendar_event / update_calendar_event / delete_calendar_event
  • delete_email / archive_email
  • crm_add_note / crm_create_lead

Confirmation format:
  📋 Here's what I'm about to do:
  [Action — e.g. "Send Email", "Delete Event", "Archive Message"]
  [Key details]
  ✅ Confirm? (say "yes", "go ahead", "send it" — or "no" to cancel)

READ-ONLY tools need NO confirmation — call them immediately:
  search_knowledge_base, read_emails, search_emails, get_email, get_thread,
  check_calendar, search_calendar, get_crm_jobs, get_crm_job, crm_get_contacts,
  list_email_labels, get_general_info
════════════════════════════════════════════`.trim();
  }

  /* ---------------------------------------------------------------------
   *  Tool Definitions (Anthropic format)
   * ------------------------------------------------------------------- */
  private getToolDefinitions(): Anthropic.Messages.Tool[] {
    return [
      // ── Knowledge Base ──────────────────────────────────────────────
      {
        name: 'search_knowledge_base',
        description: 'Search company knowledge base for SOPs, product info, FAQs, documents, and notes.',
        input_schema: { type: 'object' as const, properties: { query: { type: 'string' }, filter: { type: 'string' } }, required: ['query'] },
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
      // ── Email — WRITE (require confirmation) ───────────────────────
      {
        name: 'send_email',
        description: 'Send an email. REQUIRE confirmation before calling.',
        input_schema: {
          type: 'object' as const,
          properties: {
            to:        { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
            subject:   { type: 'string', description: 'Subject line' },
            body:      { type: 'string', description: 'Email body (plain text)' },
            cc:        { type: 'array', items: { type: 'string' } },
            draftOnly: { type: 'boolean', description: 'Save as draft only, do not send' },
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
            messageId: { type: 'string', description: 'Gmail message ID to reply to' },
            body:      { type: 'string', description: 'Reply body text' },
            replyAll:  { type: 'boolean', description: 'Reply-all (default false)' },
          },
          required: ['messageId', 'body'],
        },
      },
      {
        name: 'delete_email',
        description: 'Move an email to trash. REQUIRE confirmation before calling.',
        input_schema: {
          type: 'object' as const,
          properties: { messageId: { type: 'string' } },
          required: ['messageId'],
        },
      },
      {
        name: 'archive_email',
        description: 'Archive an email (removes from inbox, keeps in All Mail). REQUIRE confirmation before calling.',
        input_schema: {
          type: 'object' as const,
          properties: { messageId: { type: 'string' } },
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
        description: 'View calendar events for today, upcoming days, or a date range.',
        input_schema: {
          type: 'object' as const,
          properties: {
            start_date:   { type: 'string', description: 'Start date (ISO, e.g. "2024-01-15")' },
            end_date:     { type: 'string', description: 'End date (ISO)' },
            search_query: { type: 'string', description: 'Optional keyword to filter events' },
          },
          required: ['start_date'],
        },
      },
      {
        name: 'search_calendar',
        description: 'Search calendar events by keyword (title, location, attendee, description).',
        input_schema: {
          type: 'object' as const,
          properties: {
            query:      { type: 'string', description: 'Search term' },
            maxResults: { type: 'number' },
          },
          required: ['query'],
        },
      },
      // ── Calendar — WRITE (require confirmation) ────────────────────
      {
        name: 'create_calendar_event',
        description: 'Create a calendar event. REQUIRE confirmation before calling.',
        input_schema: {
          type: 'object' as const,
          properties: {
            title:       { type: 'string' },
            start_time:  { type: 'string', description: 'ISO datetime' },
            end_time:    { type: 'string', description: 'ISO datetime' },
            description: { type: 'string' },
            location:    { type: 'string' },
            attendees:   { type: 'array', items: { type: 'string' } },
          },
          required: ['title', 'start_time', 'end_time'],
        },
      },
      {
        name: 'update_calendar_event',
        description: 'Edit an existing calendar event. REQUIRE confirmation before calling.',
        input_schema: {
          type: 'object' as const,
          properties: {
            eventId:     { type: 'string', description: 'Google Calendar event ID' },
            title:       { type: 'string' },
            start_time:  { type: 'string' },
            end_time:    { type: 'string' },
            description: { type: 'string' },
            location:    { type: 'string' },
            attendees:   { type: 'array', items: { type: 'string' } },
          },
          required: ['eventId'],
        },
      },
      {
        name: 'delete_calendar_event',
        description: 'Delete a calendar event permanently. REQUIRE confirmation before calling.',
        input_schema: {
          type: 'object' as const,
          properties: { eventId: { type: 'string', description: 'Google Calendar event ID' } },
          required: ['eventId'],
        },
      },
      // ── CRM ─────────────────────────────────────────────────────────
      {
        name: 'get_crm_jobs',
        description: 'List AccuLynx CRM jobs. Filter by status or search by name/address.',
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
        description: 'Get full details for a single AccuLynx job by ID.',
        input_schema: { type: 'object' as const, properties: { jobId: { type: 'string' } }, required: ['jobId'] },
      },
      {
        name: 'crm_add_note',
        description: 'Add a note to an AccuLynx job. REQUIRE confirmation before calling.',
        input_schema: {
          type: 'object' as const,
          properties: {
            jobId:      { type: 'string' },
            note:       { type: 'string' },
            authorName: { type: 'string' },
          },
          required: ['jobId', 'note'],
        },
      },
      {
        name: 'crm_get_contacts',
        description: 'Search contacts in AccuLynx CRM.',
        input_schema: {
          type: 'object' as const,
          properties: { search: { type: 'string' }, page: { type: 'number' }, pageSize: { type: 'number' } },
          required: [],
        },
      },
      {
        name: 'crm_create_lead',
        description: 'Create a new lead in AccuLynx. REQUIRE confirmation before calling.',
        input_schema: {
          type: 'object' as const,
          properties: {
            firstName: { type: 'string' }, lastName: { type: 'string' },
            email: { type: 'string' },     phone:  { type: 'string' },
            address: { type: 'string' },   city:   { type: 'string' },
            state: { type: 'string' },     zip:    { type: 'string' },
            notes: { type: 'string' },     source: { type: 'string' },
          },
          required: ['firstName', 'lastName'],
        },
      },
      // ── General ─────────────────────────────────────────────────────
      {
        name: 'get_general_info',
        description: 'Answer general questions, do calculations, or reason about information without calling other tools.',
        input_schema: { type: 'object' as const, properties: { query: { type: 'string' } }, required: ['query'] },
      },
    ];
  }

  /* ---------------------------------------------------------------------
   *  Chat with Claude + Tool Use
   * ------------------------------------------------------------------- */
  private async runChatWithTools(
    sessionId: string,
    userPrompt: string,
  ): Promise<{ response: string; toolCalls: Array<{ tool: string; args: any; result: any }> }> {
    const history = await this.chatRepo.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      take: 10,
    });
    history.reverse(); // oldest → newest

    const messages: MessageParam[] = [
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userPrompt },
    ];

    const tools = this.getToolDefinitions();
    const toolCallsExecuted: Array<{ tool: string; args: any; result: any }> = [];

    // First call to Claude with tools
    let response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: this.systemPrompt,
      messages,
      tools,
    });

    let assistantText = '';

    // Handle tool calls if any
    while (response.stop_reason === 'tool_use') {
      this.logger.log(`Claude requested tool use(s)`);

      // Extract text and tool_use blocks from response
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
      );
      const textBlocks = response.content.filter(
        (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
      );

      // Capture assistant text
      assistantText = textBlocks.map(b => b.text).join(' ');

      // Add assistant's response to messages
      messages.push({
        role: 'assistant',
        content: response.content,
      });

      // Execute each tool call — catch individual failures so one bad tool
      // can't crash the entire voice pipeline.
      const toolResults = [];
      for (const toolUse of toolUseBlocks) {
        this.logger.log(`Executing tool: ${toolUse.name}`, toolUse.input);

        let result: any;
        try {
          result = await this.executeFunctionCall(
            toolUse.name,
            toolUse.input as any,
            sessionId,
          );
        } catch (toolErr) {
          const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
          this.logger.error(`Tool "${toolUse.name}" threw: ${errMsg}`);
          result = { error: errMsg, tool: toolUse.name };
        }

        toolCallsExecuted.push({
          tool:   toolUse.name,
          args:   toolUse.input,
          result,
        });

        toolResults.push({
          type:        'tool_result' as const,
          tool_use_id: toolUse.id,
          content:     JSON.stringify(result),
        });
      }

      // Add tool results to messages
      messages.push({
        role: 'user',
        content: toolResults as any,
      });

      // Second call to Claude with tool results
      response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        system: this.systemPrompt,
        messages,
        tools,
      });
    }

    // Extract final response
    const finalTextBlocks = response.content.filter(
      (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
    );
    const finalResponse = finalTextBlocks.length > 0
      ? finalTextBlocks.map(b => b.text).join(' ').trim()
      : assistantText.trim() || 'I apologize, I could not generate a response.';

    return {
      response: finalResponse,
      toolCalls: toolCallsExecuted,
    };
  }

  /* ---------------------------------------------------------------------
   *  Function Calling - Execution Router
   * ------------------------------------------------------------------- */
  private async executeFunctionCall(
    functionName: string,
    args: any,
    sessionId: string,
  ): Promise<any> {
    // sessionId is the userId injected by req.atomUserId in the controller
    const uid = sessionId;
    switch (functionName) {
      // ── Knowledge Base ─────────────────────────────────────────────
      case 'search_knowledge_base':
        return this.searchKnowledgeBase(args.query, args.filter, sessionId);

      // ── Email READ ─────────────────────────────────────────────────
      case 'read_emails':
        return this.gmailService.readEmails(args.maxResults ?? 20, args.query, args.unreadOnly ?? false, uid);

      case 'search_emails':
        return this.gmailService.searchEmails(args.query, args.maxResults ?? 20, uid);

      case 'get_email':
        return this.gmailService.getEmail(args.messageId, uid);

      case 'get_thread':
        return this.gmailService.getThread(args.threadId, uid);

      case 'list_email_labels':
        return this.gmailService.listLabels(uid);

      // ── Email WRITE ────────────────────────────────────────────────
      case 'send_email':
        return this.sendEmail(args, sessionId);

      case 'reply_email':
        return this.gmailService.replyToEmail(args.messageId, args.body, args.replyAll ?? false, uid);

      case 'delete_email':
        return this.gmailService.deleteEmail(args.messageId, uid);

      case 'archive_email':
        return this.gmailService.archiveEmail(args.messageId, uid);

      case 'mark_email_read':
        return this.gmailService.markRead(args.messageId, args.read, uid);

      // ── Calendar READ ──────────────────────────────────────────────
      case 'check_calendar':
        return this.checkCalendar(args.start_date, args.end_date, args.search_query, sessionId);

      case 'search_calendar':
        return this.googleCalendar.searchEvents(uid, args.query, args.maxResults ?? 20);

      // ── Calendar WRITE ─────────────────────────────────────────────
      case 'create_calendar_event':
        return this.createCalendarEvent(args, sessionId);

      case 'update_calendar_event':
        return this.googleCalendar.updateEvent(uid, args.eventId, {
          title:       args.title,
          startTime:   args.start_time,
          endTime:     args.end_time,
          description: args.description,
          location:    args.location,
          attendees:   args.attendees,
        });

      case 'delete_calendar_event':
        return this.googleCalendar.deleteEvent(uid, args.eventId);

      // ── CRM ────────────────────────────────────────────────────────
      case 'get_crm_jobs':
        return this.accuLynx.getJobs({ search: args.search, status: args.status, page: args.page, pageSize: args.pageSize });

      case 'get_crm_job':
        return this.accuLynx.getJob(args.jobId);

      case 'crm_add_note':
        return this.accuLynx.addNote(args.jobId, args.note, args.authorName);

      case 'crm_get_contacts':
        return this.accuLynx.getContacts({ search: args.search, page: args.page, pageSize: args.pageSize });

      case 'crm_create_lead':
        return this.accuLynx.createLead(args);

      // ── General ────────────────────────────────────────────────────
      case 'get_general_info':
        return this.getGeneralInfo(args.query);

      default:
        this.logger.warn(`Unknown function called: ${functionName}`);
        return { error: 'Unknown function', function: functionName };
    }
  }

  /* ---------------------------------------------------------------------
   *  Tool Implementations
   * ------------------------------------------------------------------- */
  private async searchKnowledgeBase(
    query: string,
    filter?: string,
    sessionId?: string,
  ): Promise<any> {
    this.logger.log(`Searching knowledge base: "${query}" filter=${filter}`);
    try {
      const results = await this.knowledgeBase.search(query, 5);
      if (!results.length) {
        return {
          results: [],
          message: 'No matching knowledge base entries found. Try a broader search.',
          query,
        };
      }
      return {
        results: results.map(r => ({
          id:       r.id,
          title:    r.title,
          // Truncate content for the AI context window — full text in frontend
          excerpt:  r.content.slice(0, 600) + (r.content.length > 600 ? '…' : ''),
          source:   r.source,
          category: r.category,
          similarity: r.similarity,
        })),
        message: `Found ${results.length} relevant knowledge base entry(s).`,
        query,
      };
    } catch (err: any) {
      this.logger.error('searchKnowledgeBase error:', err.message);
      return { results: [], error: err.message, query };
    }
  }

  private async checkCalendar(
    startDate: string,
    endDate?: string,
    searchQuery?: string,
    sessionId?: string,
  ): Promise<any> {
    this.logger.log(`Checking calendar: ${startDate} to ${endDate}`);
    // Try Google Calendar first (OAuth-based), fall back to Microsoft Graph
    try {
      const userId = sessionId ?? '';
      const status = await this.googleCalendar.getConnectionStatus(userId);
      if (status.connected) {
        const days = endDate
          ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000)
          : 1;
        return this.googleCalendar.getUpcomingEvents(userId, Math.max(days, 1));
      }
    } catch {}
    // Fall back to Microsoft
    return this.calendarService.checkCalendar(startDate, endDate, searchQuery, sessionId);
  }

  private async createCalendarEvent(args: any, sessionId?: string): Promise<any> {
    this.logger.log(`Creating calendar event: ${args.title}`);
    // Try Google Calendar first
    try {
      const userId = sessionId ?? '';
      const status = await this.googleCalendar.getConnectionStatus(userId);
      if (status.connected) {
        return this.googleCalendar.createEvent(
          userId,
          args.title,
          args.start_time,
          args.end_time,
          args.description,
          args.location,
          args.attendees,
        );
      }
    } catch {}
    // Fall back to Microsoft
    return this.calendarService.createCalendarEvent(
      args.title,
      args.start_time,
      args.end_time,
      args.description,
      args.attendees,
      args.location,
      sessionId,
    );
  }

  private async sendEmail(args: any, sessionId?: string): Promise<any> {
    this.logger.log(`Sending email to: ${args.to.join(', ')}`);
    return this.emailService.sendEmail(
      args.to,
      args.subject,
      args.body,
      args.draft_only || false,
      args.cc,
      args.bcc,
      args.html,
      sessionId,
    );
  }

  private async getGeneralInfo(query: string): Promise<any> {
    this.logger.log(`[STUB] General info request: ${query}`);
    // This can just return the query for the AI to answer naturally
    return {
      info: 'No additional information needed. Answer based on general knowledge.',
      query,
    };
  }

  /* ---------------------------------------------------------------------
   *  Public text pipeline
   * ------------------------------------------------------------------- */
  async processTextCommand(
    message: string,
    userId: string,
    conversationId?: string,
  ): Promise<ProcessResult> {
    const sessionId = conversationId ?? userId;

    const { response: reply, toolCalls } = await this.runChatWithTools(sessionId, message);

    await this.chatRepo.save([
      { sessionId, role: 'user', content: message },
      { sessionId, role: 'assistant', content: reply },
    ]);

    return {
      response: reply,
      conversationId: sessionId,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  async processPrompt(prompt: string, sessionId: string): Promise<string> {
    const { response } = await this.processTextCommand(
      prompt,
      sessionId,
      sessionId,
    );
    return response;
  }

  /* ---------------------------------------------------------------------
   *  Voice pipeline with TTS
   * ------------------------------------------------------------------- */
  async processVoiceCommand(
    audioBuffer: Buffer,
    userId: string,
    conversationId?: string,
    mimeType?: string,
  ): Promise<ProcessResult> {
    // Use the correct extension so Whisper can infer the audio format.
    // Browser MediaRecorder sends audio/webm (or audio/webm;codecs=opus).
    // Default to .webm; fall back to .mp3 for legacy clients.
    const ext = mimeType?.includes('webm') ? '.webm'
              : mimeType?.includes('ogg')  ? '.ogg'
              : mimeType?.includes('wav')  ? '.wav'
              : mimeType?.includes('mp4')  ? '.mp4'
              : '.mp3';
    const tmpPath = path.join(os.tmpdir(), `voice-${Date.now()}${ext}`);
    await writeFile(tmpPath, audioBuffer);

    try {
      // 1) Whisper transcription (OpenAI)
      const { text } = await this.openai.audio.transcriptions.create({
        file: createReadStream(tmpPath) as any,
        model: 'whisper-1',
      });
      const transcription = text?.trim();
      if (!transcription) throw new Error('Transcription returned empty text');

      // 2) Process with Claude
      const sessionId = conversationId ?? userId;
      const { response: reply, toolCalls } = await this.runChatWithTools(sessionId, transcription);

      await this.chatRepo.save([
        { sessionId, role: 'user', content: transcription },
        { sessionId, role: 'assistant', content: reply },
      ]);

      // 3) Generate TTS audio response (OpenAI)
      let audioResponse: Buffer | undefined;
      try {
        const speechResponse = await this.openai.audio.speech.create({
          model: 'tts-1',
          voice: 'alloy',
          input: reply,
        });
        audioResponse = Buffer.from(await speechResponse.arrayBuffer());
        this.logger.log('TTS audio generated successfully');
      } catch (ttsError) {
        this.logger.warn(`TTS generation failed: ${ttsError.message}`);
        // Continue without audio - it's optional
      }

      return {
        response: reply,
        conversationId: sessionId,
        transcription,
        audioResponse,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    } finally {
      await unlink(tmpPath).catch(() =>
        this.logger.warn(`Temp file not removed: ${tmpPath}`),
      );
    }
  }

  /** Standalone TTS – converts any text to audio/mpeg via OpenAI TTS */
  async generateSpeech(
    text: string,
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova',
  ): Promise<Buffer> {
    const cleaned = text
      .replace(/```[\s\S]*?```/g, '')          // strip code blocks
      .replace(/\*\*|__|\*|_|~~|`/g, '')       // strip markdown symbols
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → keep label text
      .trim()
      .slice(0, 4096);

    const speechResponse = await this.openai.audio.speech.create({
      model: 'tts-1',
      voice,
      input: cleaned || 'I had nothing to say.',
    });
    return Buffer.from(await speechResponse.arrayBuffer());
  }
}
