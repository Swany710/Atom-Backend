import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageToolCall
} from 'openai/resources/chat/completions';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMemory } from './chat-memory.entity';
import * as path from 'path';
import * as os from 'os';
import { writeFile, unlink } from 'fs/promises';
import { createReadStream } from 'fs';

interface ProcessResult {
  response: string;
  conversationId: string;
  transcription?: string;
  toolCalls?: Array<{ tool: string; args: any; result: any }>;
}

@Injectable()
export class AIVoiceService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(AIVoiceService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(ChatMemory)
    private readonly chatRepo: Repository<ChatMemory>,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
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

  /** Build a message array (last-10 turns) and call OpenAI */
  private async runChatCompletion(
    sessionId: string,
    userPrompt: string,
  ): Promise<string> {
    const history = await this.chatRepo.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      take: 10,
    });
    history.reverse(); // oldest → newest

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userPrompt },
    ];

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages,
      max_tokens: 500,
      temperature: 0.7,
    });

    return (
      completion.choices[0]?.message?.content?.trim() ??
      'I am sorry, I could not generate a response.'
    );
  }

  /* ---------------------------------------------------------------------
   *  Function Calling - Tool Definitions
   * ------------------------------------------------------------------- */
  private getToolDefinitions(): ChatCompletionTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'search_knowledge_base',
          description: 'Search the user\'s knowledge base for company documents, project information, notes, or any stored information. Use this when the user asks about specific projects, documents, or company information.',
          parameters: {
            type: 'object',
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
        }
      },
      {
        type: 'function',
        function: {
          name: 'check_calendar',
          description: 'Check the user\'s calendar for events, meetings, or availability. Use this when the user asks about their schedule, meetings, or when they\'re free.',
          parameters: {
            type: 'object',
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
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_calendar_event',
          description: 'Create a new calendar event or meeting. Use this when the user wants to schedule something.',
          parameters: {
            type: 'object',
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
        }
      },
      {
        type: 'function',
        function: {
          name: 'send_email',
          description: 'Send an email on behalf of the user. Use this when the user wants to send or draft an email.',
          parameters: {
            type: 'object',
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
              draft_only: {
                type: 'boolean',
                description: 'If true, create a draft instead of sending'
              }
            },
            required: ['to', 'subject', 'body']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'update_crm',
          description: 'Update customer relationship management system with customer information, notes, or status updates.',
          parameters: {
            type: 'object',
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
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_general_info',
          description: 'Get general information or answer questions that don\'t require accessing specific tools. Use this for general knowledge, calculations, or conversational responses.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The user\'s question or request'
              }
            },
            required: ['query']
          }
        }
      }
    ];
  }

  /* ---------------------------------------------------------------------
   *  Function Calling - Main Orchestrator
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
    history.reverse();

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userPrompt },
    ];

    const tools = this.getToolDefinitions();
    const toolCallsExecuted: Array<{ tool: string; args: any; result: any }> = [];

    // First call to OpenAI with tools
    let completion = await this.openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages,
      tools,
      tool_choice: 'auto',
      max_tokens: 1000,
      temperature: 0.7,
    });

    let assistantMessage = completion.choices[0]?.message;

    // Handle tool calls if any
    if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
      this.logger.log(`AI requested ${assistantMessage.tool_calls.length} tool call(s)`);

      // Add assistant's message with tool calls to conversation
      messages.push({
        role: 'assistant',
        content: assistantMessage.content || '',
        tool_calls: assistantMessage.tool_calls,
      } as any);

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        this.logger.log(`Executing tool: ${functionName}`, functionArgs);

        // Execute the function
        const result = await this.executeFunctionCall(functionName, functionArgs, sessionId);

        toolCallsExecuted.push({
          tool: functionName,
          args: functionArgs,
          result,
        });

        // Add function result to messages
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        } as any);
      }

      // Second call to OpenAI with function results
      completion = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages,
        max_tokens: 1000,
        temperature: 0.7,
      });

      assistantMessage = completion.choices[0]?.message;
    }

    const finalResponse = assistantMessage?.content?.trim() || 'I apologize, I could not generate a response.';

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
    this.logger.log(`[STUB] Checking calendar: ${startDate} to ${endDate}`);
    // TODO: Implement Google Calendar / Outlook integration
    return {
      events: [],
      message: 'Calendar integration not yet implemented. This is a placeholder response.',
      startDate,
      endDate,
    };
  }

  private async createCalendarEvent(args: any, sessionId?: string): Promise<any> {
    this.logger.log(`[STUB] Creating calendar event: ${args.title}`);
    // TODO: Implement Google Calendar / Outlook event creation
    return {
      success: false,
      message: 'Calendar integration not yet implemented. This is a placeholder response.',
      event: args,
    };
  }

  private async sendEmail(args: any, sessionId?: string): Promise<any> {
    this.logger.log(`[STUB] Sending email to: ${args.to.join(', ')}`);
    // TODO: Implement Gmail API / Outlook API
    return {
      success: false,
      message: 'Email integration not yet implemented. This is a placeholder response.',
      draft_created: args.draft_only || false,
      email: args,
    };
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
   *  Public text pipeline (NOW WITH FUNCTION CALLING!)
   * ------------------------------------------------------------------- */
  async processTextCommand(
    message: string,
    userId: string,
    conversationId?: string,
  ): Promise<ProcessResult> {
    /** 🔑  Use one stable ID for the whole thread */
    const sessionId = conversationId ?? userId;

    // Use function calling for intelligent tool selection
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

  /** Back-compat helper for controllers that still invoke `processPrompt` */
  async processPrompt(prompt: string, sessionId: string): Promise<string> {
    const { response } = await this.processTextCommand(
      prompt,
      sessionId,
      sessionId,
    );
    return response;
  }

  /* ---------------------------------------------------------------------
   *  Voice pipeline
   * ------------------------------------------------------------------- */
  async processVoiceCommand(
    audioBuffer: Buffer,
    userId: string,
    conversationId?: string,
  ): Promise<ProcessResult> {
    const tmpPath = path.join(os.tmpdir(), `voice-${Date.now()}.mp3`);
    await writeFile(tmpPath, audioBuffer);

    try {
      // 1) Whisper transcription
      const { text } = await this.openai.audio.transcriptions.create({
        file: createReadStream(tmpPath) as any,
        model: 'whisper-1',
      });
      const transcription = text?.trim();
      if (!transcription) throw new Error('Transcription returned empty text');

      // 2) Reuse text pipeline (same session ID ⇒ full memory)
      const result = await this.processTextCommand(
        transcription,
        userId,
        conversationId ?? userId,
      );

      // 3) Return combined payload
      return { ...result, transcription };
    } finally {
      await unlink(tmpPath).catch(() =>
        this.logger.warn(`Temp file not removed: ${tmpPath}`),
      );
    }
  }
}
