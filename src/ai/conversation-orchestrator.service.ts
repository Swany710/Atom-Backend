import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { ChatMemory } from './chat-memory.entity';
import { ToolDefinitionsService } from './tool-definitions.service';
import { ToolExecutorService } from './tool-executor.service';
import { providerAI } from '../utils/provider-call';

export interface ChatResult {
  response: string;
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>;
}

/**
 * ConversationOrchestratorService
 *
 * Manages the Claude tool-use loop:
 *   1. Load conversation history from ChatMemory
 *   2. Call Claude with tool definitions
 *   3. If Claude requests tool calls → route to ToolExecutorService
 *   4. Feed results back to Claude
 *   5. Return final text response
 *
 * This keeps orchestration logic (Claude API calls, message threading,
 * tool-use loop) separate from tool dispatch and separate from voice/TTS.
 */
@Injectable()
export class ConversationOrchestratorService {
  private readonly anthropic: Anthropic;
  private readonly logger = new Logger(ConversationOrchestratorService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(ChatMemory)
    private readonly chatRepo: Repository<ChatMemory>,
    private readonly toolDefs: ToolDefinitionsService,
    private readonly toolExecutor: ToolExecutorService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  get systemPrompt(): string {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
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
CONFIRMATION RULE — BACKEND-ENFORCED FOR WRITE ACTIONS
════════════════════════════════════════════
The backend enforces confirmation for write actions. When you call a write tool
WITHOUT pendingActionId, the backend returns:
  { requiresConfirmation: true, pendingActionId: "<id>", summary: "...", expiresAt: "..." }

When you receive requiresConfirmation:
1. Present the summary to the user using this format:
   📋 Here's what I'm about to do:
   [summary from the response]
   ✅ Confirm? (say "yes", "go ahead", "send it" — or "no" to cancel)
2. When the user confirms, call the SAME tool again with pendingActionId set to the id you received.
3. The backend will execute the action and return the real result.

READ-ONLY tools (search, read, get, check, list) execute immediately — no confirmation needed.
════════════════════════════════════════════`.trim();
  }

  /**
   * Run a full chat turn with tool-use loop.
   * Loads history, calls Claude, handles tool calls, returns final response.
   */
  async runChat(
    sessionId: string,
    userMessage: string,
    userId: string,
    correlationId?: string,
  ): Promise<ChatResult> {
    // Load conversation history (last 20 exchanges to bound context)
    const history = await this.chatRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
      take: 40,
    });

    const messages: MessageParam[] = history.map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    }));

    messages.push({ role: 'user', content: userMessage });

    const tools = this.toolDefs.getTools();
    const toolCallsExecuted: Array<{ tool: string; args: unknown; result: unknown }> = [];

    let response = await providerAI(
      () => this.anthropic.messages.create({
        model:      'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        system:     this.systemPrompt,
        messages,
        tools,
      }),
      'anthropic.messages.create',
    );

    let assistantText = '';

    // Tool-use loop — Anthropic may request multiple tool calls per turn
    while (response.stop_reason === 'tool_use') {
      const textBlocks = response.content.filter(
        (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
      );
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
      );

      assistantText = textBlocks.map(b => b.text).join(' ');

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        this.logger.log(`Executing tool: ${toolUse.name}`);

        let result: unknown;
        try {
          result = await this.toolExecutor.execute(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            userId,
            sessionId,
            correlationId,
          );
        } catch (toolErr) {
          const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
          this.logger.error(`Tool "${toolUse.name}" threw: ${errMsg}`);
          result = { error: errMsg, tool: toolUse.name };
        }

        toolCallsExecuted.push({ tool: toolUse.name, args: toolUse.input, result });
        toolResults.push({
          type:        'tool_result',
          tool_use_id: toolUse.id,
          content:     JSON.stringify(result),
        });
      }

      messages.push({ role: 'user', content: toolResults });

      response = await providerAI(
        () => this.anthropic.messages.create({
          model:      'claude-sonnet-4-5-20250929',
          max_tokens: 1024,
          system:     this.systemPrompt,
          messages,
          tools,
        }),
        'anthropic.messages.create',
      );
    }

    // Extract final text response
    const finalTextBlocks = response.content.filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
    );
    const finalResponse = finalTextBlocks.length > 0
      ? finalTextBlocks.map(b => b.text).join(' ').trim()
      : assistantText.trim() || 'I apologize, I could not generate a response.';

    return { response: finalResponse, toolCalls: toolCallsExecuted };
  }
}
