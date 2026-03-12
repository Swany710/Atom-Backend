import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { ConversationMemoryService } from './conversation-memory.service';
import { ToolDefinitionsService } from './tool-definitions.service';
import { ToolExecutionService } from './tool-execution.service';
import { providerAI } from '../utils/provider-call';

export interface ChatResult {
  response: string;
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>;
}

/**
 * ClaudeTaskOrchestratorService
 *
 * Claude is the SOLE reasoning engine.  This service owns:
 *   - Anthropic API client and model selection
 *   - System prompt (Atom persona, capabilities, confirmation rules)
 *   - Tool-use loop: call Claude → execute tools → feed results back → repeat
 *   - Task planning and tool selection decisions
 *
 * What this service does NOT do:
 *   - Transcription / TTS  →  OpenAiVoiceGatewayService
 *   - Memory persistence   →  ConversationMemoryService
 *   - Tool dispatch        →  ToolExecutionService
 *
 * Data flow for a single turn:
 *   1. Load history from ConversationMemoryService
 *   2. Append current user message
 *   3. POST to Claude with all tool definitions
 *   4. If stop_reason === 'tool_use':
 *        a. Execute each requested tool via ToolExecutionService
 *        b. Append tool_result messages
 *        c. POST to Claude again
 *        d. Repeat until stop_reason !== 'tool_use'
 *   5. Return final text response + tool call log
 *   (Memory persistence is handled by the caller — AIVoiceService)
 */
@Injectable()
export class ClaudeTaskOrchestratorService {
  private readonly anthropic: Anthropic;
  private readonly logger = new Logger(ClaudeTaskOrchestratorService.name);

  /** Claude model used for all orchestration and task execution. */
  static readonly MODEL = 'claude-sonnet-4-5-20250929';

  constructor(
    private readonly config: ConfigService,
    private readonly memory: ConversationMemoryService,
    private readonly toolDefs: ToolDefinitionsService,
    private readonly toolExecution: ToolExecutionService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  // ── System prompt ─────────────────────────────────────────────────────────

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

  // ── Main entry point ──────────────────────────────────────────────────────

  /**
   * Run a full chat turn:  load history → call Claude → tool loop → return text.
   *
   * Memory persistence (appendPair) is intentionally left to the caller
   * (AIVoiceService) so the orchestrator stays stateless and testable.
   *
   * @param sessionId     Conversation thread identifier.
   * @param userMessage   Raw user input (already transcribed if voice).
   * @param userId        Authenticated user ID — passed to ToolExecutionService.
   * @param correlationId Optional request tracing ID.
   */
  async runChat(
    sessionId: string,
    userMessage: string,
    userId: string,
    correlationId?: string,
  ): Promise<ChatResult> {
    // 1. Load conversation history
    const history = await this.memory.loadHistory(sessionId);
    const messages: MessageParam[] = [
      ...history,
      { role: 'user', content: userMessage },
    ];

    const tools = this.toolDefs.getTools();
    const toolCallsExecuted: Array<{ tool: string; args: unknown; result: unknown }> = [];

    // 2. Initial Claude call
    let response = await providerAI(
      () => this.anthropic.messages.create({
        model:      ClaudeTaskOrchestratorService.MODEL,
        max_tokens: 1024,
        system:     this.systemPrompt,
        messages,
        tools,
      }),
      'anthropic.messages.create',
    );

    let assistantText = '';

    // 3. Tool-use loop — Claude may request multiple parallel tool calls per turn
    while (response.stop_reason === 'tool_use') {
      const textBlocks = response.content.filter(
        (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
      );
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
      );

      assistantText = textBlocks.map(b => b.text).join(' ');

      // Append the full assistant turn (text + tool_use blocks) to message thread
      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        this.logger.log(
          `[${correlationId ?? sessionId}] tool_use: ${toolUse.name}`,
        );

        let result: unknown;
        try {
          result = await this.toolExecution.execute(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            userId,
            sessionId,
            correlationId,
          );
        } catch (toolErr) {
          const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
          this.logger.error(
            `[${correlationId ?? sessionId}] tool "${toolUse.name}" threw: ${errMsg}`,
          );
          result = { error: errMsg, tool: toolUse.name };
        }

        toolCallsExecuted.push({
          tool:   toolUse.name,
          args:   toolUse.input,
          result,
        });

        toolResults.push({
          type:        'tool_result',
          tool_use_id: toolUse.id,
          content:     JSON.stringify(result),
        });
      }

      // Feed tool results back to Claude
      messages.push({ role: 'user', content: toolResults });

      response = await providerAI(
        () => this.anthropic.messages.create({
          model:      ClaudeTaskOrchestratorService.MODEL,
          max_tokens: 1024,
          system:     this.systemPrompt,
          messages,
          tools,
        }),
        'anthropic.messages.create',
      );
    }

    // 4. Extract final text response
    const finalTextBlocks = response.content.filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
    );

    const finalResponse = finalTextBlocks.length > 0
      ? finalTextBlocks.map(b => b.text).join(' ').trim()
      : assistantText.trim() || 'I apologize, I could not generate a response.';

    return { response: finalResponse, toolCalls: toolCallsExecuted };
  }
}
