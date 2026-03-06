import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { EMAIL_PROVIDER, IEmailService } from '../integrations/email/email.provider';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMemory } from './chat-memory.entity';
import { CalendarService } from '../integrations/calendar/calendar.service';
import { GoogleCalendarService } from '../integrations/calendar/google-calendar.service';
import { AccuLynxService } from '../integrations/crm/acculynx.service';
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
    private readonly calendarService: CalendarService,
    private readonly googleCalendar: GoogleCalendarService,
    private readonly accuLynx: AccuLynxService,
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
    const today = new Date().toLocaleDateString();
    return `You are Atom, an AI personal assistant for a roofing/contracting business. You help users manage their work by:
    - Searching their knowledge base for company/project information
    - Managing their Google Calendar (viewing and creating events)
    - Handling emails (reading, drafting, sending via Gmail)
    - Looking up and updating AccuLynx CRM jobs, contacts, and leads
    - Answering general questions

    Today's date is ${today}.

    ════════════════════════════════════════════════════════
    CONFIRMATION RULE — THIS IS MANDATORY. NEVER SKIP IT.
    ════════════════════════════════════════════════════════

    Before calling ANY of these action tools you MUST get explicit user confirmation:
      • send_email
      • create_calendar_event
      • crm_add_note
      • crm_create_lead

    The required flow is:
    1. Gather all needed information first (ask follow-up questions if anything is missing).
    2. Present a clear confirmation summary in this exact format:

       📋 Here's what I'm about to do:
       [Action type, e.g. "Send Email / Create Event / Add CRM Note / Create Lead"]

       [Key details — e.g. To:, Subject:, Body:, Date:, Time:, Job ID:, Note:, etc.]

       ✅ Shall I go ahead? (Reply "yes", "send it", "confirm", "go ahead" — or "no" / "cancel" to stop)

    3. WAIT for the user to reply with a clear "yes" or approval word.
    4. ONLY after receiving explicit confirmation, call the tool.

    If the user says "no", "cancel", "stop", or "change", do NOT call the tool.
    Ask what they would like to change instead.

    READ-ONLY tools (search_knowledge_base, check_calendar, get_crm_jobs, get_crm_job,
    crm_get_contacts, get_general_info) do NOT need confirmation — call them freely.
    ════════════════════════════════════════════════════════`.trim();
  }

  /* ---------------------------------------------------------------------
   *  Tool Definitions (Anthropic format)
   * ------------------------------------------------------------------- */
  private getToolDefinitions(): Anthropic.Messages.Tool[] {
    return [
      {
        name: 'search_knowledge_base',
        description: 'Search the user\'s knowledge base for company documents, project information, notes, or any stored information. Use this when the user asks about specific projects, documents, or company information.',
        input_schema: {
          type: 'object' as const,
          properties: {
            query: {
              type: 'string',
              description: 'The search query to find relevant information'
            },
            filter: {
              type: 'string',
              description: 'Optional filter (e.g., "project_name", "document_type")',
            }
          },
          required: ['query']
        }
      },
      {
        name: 'check_calendar',
        description: 'Check the user\'s calendar for events, meetings, or availability. Use this when the user asks about their schedule, meetings, or when they\'re free.',
        input_schema: {
          type: 'object' as const,
          properties: {
            start_date: {
              type: 'string',
              description: 'Start date in ISO format (e.g., "2024-01-15")'
            },
            end_date: {
              type: 'string',
              description: 'End date in ISO format (e.g., "2024-01-20")'
            },
            search_query: {
              type: 'string',
              description: 'Optional search term to filter events'
            }
          },
          required: ['start_date']
        }
      },
      {
        name: 'create_calendar_event',
        description: 'Create a new calendar event or meeting. IMPORTANT: You MUST show the user a confirmation summary (Title, Date, Time, Attendees) and receive explicit approval ("yes", "create it", "confirm", "go ahead") BEFORE calling this tool. Never call this tool speculatively or without confirmed approval.',
        input_schema: {
          type: 'object' as const,
          properties: {
            title: {
              type: 'string',
              description: 'Event title'
            },
            start_time: {
              type: 'string',
              description: 'Start time in ISO format (e.g., "2024-01-15T14:00:00")'
            },
            end_time: {
              type: 'string',
              description: 'End time in ISO format'
            },
            description: {
              type: 'string',
              description: 'Event description or notes'
            },
            attendees: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of attendee email addresses'
            }
          },
          required: ['title', 'start_time', 'end_time']
        }
      },
      {
        name: 'send_email',
        description: 'Send an email on behalf of the user. IMPORTANT: You MUST show the user a confirmation summary (To, Subject, Body) and receive explicit approval ("yes", "send it", "confirm", "go ahead") BEFORE calling this tool. Never call this tool speculatively or without confirmed approval.',
        input_schema: {
          type: 'object' as const,
          properties: {
            to: {
              type: 'array',
              items: { type: 'string' },
              description: 'Recipient email addresses'
            },
            subject: {
              type: 'string',
              description: 'Email subject line'
            },
            body: {
              type: 'string',
              description: 'Email body content'
            },
            provider: {
              type: 'string',
              enum: ['gmail', 'outlook'],
              description: 'Email provider to use for sending'
            },
            draft_only: {
              type: 'boolean',
              description: 'If true, create a draft instead of sending'
            }
          },
          required: ['to', 'subject', 'body']
        }
      },
      {
        name: 'get_crm_jobs',
        description: 'List jobs/projects from AccuLynx CRM. Use this to find jobs by status, search for a customer\'s job, or see recent jobs.',
        input_schema: {
          type: 'object' as const,
          properties: {
            search:   { type: 'string', description: 'Search by customer name, address, or job name' },
            status:   { type: 'string', description: 'Filter by job status (e.g. "active", "completed")' },
            page:     { type: 'number', description: 'Page number (default 1)' },
            pageSize: { type: 'number', description: 'Results per page (default 25)' },
          },
          required: [],
        },
      },
      {
        name: 'get_crm_job',
        description: 'Get full details for a single AccuLynx job by its job ID.',
        input_schema: {
          type: 'object' as const,
          properties: {
            jobId: { type: 'string', description: 'The AccuLynx job ID' },
          },
          required: ['jobId'],
        },
      },
      {
        name: 'crm_add_note',
        description: 'Add a note/comment to an AccuLynx job. IMPORTANT: Show the user a confirmation (Job ID, Note text) and wait for explicit approval before calling.',
        input_schema: {
          type: 'object' as const,
          properties: {
            jobId:      { type: 'string', description: 'The AccuLynx job ID' },
            note:       { type: 'string', description: 'The note text to add' },
            authorName: { type: 'string', description: 'Author name (defaults to "Atom AI")' },
          },
          required: ['jobId', 'note'],
        },
      },
      {
        name: 'crm_get_contacts',
        description: 'Search contacts in AccuLynx CRM.',
        input_schema: {
          type: 'object' as const,
          properties: {
            search:   { type: 'string', description: 'Search by name, email, or phone' },
            page:     { type: 'number', description: 'Page number (default 1)' },
            pageSize: { type: 'number', description: 'Results per page (default 25)' },
          },
          required: [],
        },
      },
      {
        name: 'crm_create_lead',
        description: 'Create a new lead in AccuLynx CRM. IMPORTANT: Show the user a confirmation summary (Name, Email, Phone, Address) and wait for explicit approval before calling.',
        input_schema: {
          type: 'object' as const,
          properties: {
            firstName: { type: 'string', description: 'First name' },
            lastName:  { type: 'string', description: 'Last name' },
            email:     { type: 'string', description: 'Email address' },
            phone:     { type: 'string', description: 'Phone number' },
            address:   { type: 'string', description: 'Street address' },
            city:      { type: 'string', description: 'City' },
            state:     { type: 'string', description: 'State abbreviation' },
            zip:       { type: 'string', description: 'ZIP code' },
            notes:     { type: 'string', description: 'Additional notes' },
            source:    { type: 'string', description: 'Lead source (defaults to "Atom AI")' },
          },
          required: ['firstName', 'lastName'],
        },
      },
      {
        name: 'get_general_info',
        description: 'Get general information or answer questions that don\'t require accessing specific tools. Use this for general knowledge, calculations, or conversational responses.',
        input_schema: {
          type: 'object' as const,
          properties: {
            query: {
              type: 'string',
              description: 'The user\'s question or request'
            }
          },
          required: ['query']
        }
      }
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
    switch (functionName) {
      case 'search_knowledge_base':
        return this.searchKnowledgeBase(args.query, args.filter, sessionId);

      case 'check_calendar':
        return this.checkCalendar(args.start_date, args.end_date, args.search_query, sessionId);

      case 'create_calendar_event':
        return this.createCalendarEvent(args, sessionId);

      case 'send_email':
        return this.sendEmail(args, sessionId);

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

      case 'get_general_info':
        return this.getGeneralInfo(args.query);

      default:
        this.logger.warn(`Unknown function called: ${functionName}`);
        return { error: 'Unknown function', function: functionName };
    }
  }

  /* ---------------------------------------------------------------------
   *  Tool Implementations (Stubs - to be implemented)
   * ------------------------------------------------------------------- */
  private async searchKnowledgeBase(
    query: string,
    filter?: string,
    sessionId?: string,
  ): Promise<any> {
    this.logger.log(`[STUB] Searching knowledge base: ${query}`);
    // TODO: Implement RAG integration (Pinecone, Weaviate, ChromaDB, etc.)
    return {
      results: [],
      message: 'Knowledge base integration not yet implemented. This is a placeholder response.',
      query,
      filter,
    };
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
      const userId = sessionId ?? 'default-user';
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
      const userId = sessionId ?? 'default-user';
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
}
