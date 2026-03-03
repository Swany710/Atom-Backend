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
    return `You are Atom, an AI personal assistant. You help users manage their work and personal life by:
    - Searching their knowledge base for company/project information
    - Managing their calendar (viewing and creating events)
    - Handling emails (reading, drafting, sending)
    - Updating their CRM with customer information
    - Answering general questions

    You have access to various tools to help users. Use them when appropriate.
    Be proactive, concise, and helpful. Today's date is ${today}.`.trim();
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
        description: 'Create a new calendar event or meeting. Use this when the user wants to schedule something.',
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
        description: 'Send an email on behalf of the user. Use this when the user wants to send or draft an email.',
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
        name: 'update_crm',
        description: 'Update customer relationship management system with customer information, notes, or status updates.',
        input_schema: {
          type: 'object' as const,
          properties: {
            customer_id: {
              type: 'string',
              description: 'Customer ID or email'
            },
            action: {
              type: 'string',
              enum: ['update_notes', 'update_status', 'create_contact', 'log_interaction'],
              description: 'Action to perform in CRM'
            },
            data: {
              type: 'object',
              description: 'Data to update (varies by action)'
            }
          },
          required: ['action', 'data']
        }
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

      case 'update_crm':
        return this.updateCRM(args.customer_id, args.action, args.data, sessionId);

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
    return this.calendarService.checkCalendar(startDate, endDate, searchQuery, sessionId);
  }

  private async createCalendarEvent(args: any, sessionId?: string): Promise<any> {
    this.logger.log(`Creating calendar event: ${args.title}`);
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

  private async updateCRM(
    customerId: string,
    action: string,
    data: any,
    sessionId?: string,
  ): Promise<any> {
    this.logger.log(`[STUB] Updating CRM: ${action} for ${customerId}`);
    // TODO: Implement Salesforce / HubSpot / custom CRM integration
    return {
      success: false,
      message: 'CRM integration not yet implemented. This is a placeholder response.',
      customerId,
      action,
      data,
    };
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
