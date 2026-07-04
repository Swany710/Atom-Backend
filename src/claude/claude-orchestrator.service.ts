import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { ConversationMemoryService } from '../conversations/conversation-memory.service';
import { ToolDefinitionsService } from '../tools/tool-definitions.service';
import { ToolExecutionService } from '../tools/tool-execution.service';
import { providerAI } from '../utils/provider-call';

export interface ChatResult {
  response: string;
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>;
  newMessages: MessageParam[];
}

/**
 * ClaudeOrchestratorService
 *
 * Two execution modes:
 *   runChat()    - standard request/response (text endpoint, tests)
 *   streamChat() - streaming final turn (voice fast path, parallel TTS)
 */
@Injectable()
export class ClaudeOrchestratorService {
  private readonly anthropic: Anthropic;
  private readonly logger = new Logger(ClaudeOrchestratorService.name);

  // Configurable via CLAUDE_MODEL env var so model upgrades don't require a
  // code change + redeploy — just update the variable and restart.
  static readonly MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

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

  // -- System prompt -------------------------------------------------------

  /**
   * Build the system prompt, optionally injecting the currently-active
   * pending action so the LLM never has to guess which "yes" applies to.
   */
  buildSystemPrompt(activePending?: { id: string; summary: string } | null): string {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    const pendingBlock = activePending
      ? `\n\nACTIVE PENDING ACTION (awaiting confirmation right now):\n  pendingActionId: ${activePending.id}\n  summary: ${activePending.summary}\nIf the user says yes/confirm/proceed/sure/go ahead, call the same tool again with this pendingActionId immediately.`
      : '';

    return `You are Atom, an AI personal assistant for a roofing and contracting business. You are proactive, organized, and operate like a world-class executive assistant. Today is ${today}. All times are in Central Time (CT) unless the user specifies otherwise.

You have full access to the user's:
  - Gmail - read, search, summarize, reply, send, draft, delete, archive, mark read/unread
  - Google Calendar - view, search, create, edit, delete events
  - AccuLynx CRM - view jobs, contacts, leads; add notes; create leads
  - Company Knowledge Base - search for SOPs, company info, product details, FAQs
  - Scheduled Tasks - schedule future actions (e.g. send a reminder email at a specific date/time), list scheduled tasks, cancel tasks
  - General reasoning - summarize, prioritize, plan, answer questions

HOW TO BEHAVE AS A PERSONAL ASSISTANT
- Be proactive and thorough. When asked to "check my email", pull 10-20 emails and give a smart summary.
- When asked to "prioritize my day", check BOTH calendar and email, then give a clear, ordered action plan.
- When summarizing, always include: sender, subject, key ask, and urgency level.
- When searching email, use smart Gmail query syntax (from:, subject:, is:unread, after:, etc.).
- For calendar, always default to Central Time (CT) for all event times.
- Chain tools together. e.g. "What's on my plate?" --> check calendar + read emails + summarize everything.
- If the user says something vague, interpret it helpfully and do the most useful thing.
- When scheduling tasks: always confirm the scheduled date/time back to the user in Central Time (CT) so they can verify it's correct.
- For relative times like "tomorrow at 9am", "Friday at 3pm", "next Monday", compute the actual date based on today's date (${today}) in CT.
- After scheduling, always tell the user: what will be sent/done, and exactly when (day + time CT).

CONFIRMATION RULE - BACKEND-ENFORCED FOR WRITE ACTIONS
The backend enforces confirmation for write actions. When you call a write tool
WITHOUT pendingActionId, the backend returns:
  { requiresConfirmation: true, pendingActionId: "<id>", summary: "...", expiresAt: "..." }

When you receive requiresConfirmation:
1. Present the summary to the user clearly: "Here's what I'm about to do: [summary]. Shall I proceed?"
2. When the user confirms, call the SAME tool again with pendingActionId set to the id you received.
3. The backend will execute the action and return the real result.

READ-ONLY tools (search, read, get, check, list) execute immediately - no confirmation needed.

CONFIRMATION DISAMBIGUATION - CRITICAL RULE:
"Yes", "ok", "proceed", "confirm", "go ahead", "do it", "sure", "please", "yep", "yeah" and
similar affirmative words ALWAYS refer to YOUR MOST RECENT question or pending action.
NEVER apply a "yes" to an earlier turn in the conversation history.
Look at your very last message — that is what the user is confirming.
If your last message asked "Shall I delete 20 PetSmart emails?", then "yes" = delete those emails.
If your last message asked about a calendar event, then "yes" = confirm that event.
Do NOT reach back to earlier conversation turns when processing a confirmation.${pendingBlock}`.trim();
  }

  /** Legacy getter — delegates to buildSystemPrompt() with no active pending. */
  get systemPrompt(): string {
    return this.buildSystemPrompt(null);
  }

  // -- Helper: extract most recent active pending action from history --------

  /**
   * Scan the last 8 messages for the most recent tool_result that contains
   * { requiresConfirmation: true, pendingActionId: "..." }.
   *
   * This lets us inject the active pendingActionId directly into the system
   * prompt so the LLM never has to guess which "yes" belongs to.
   */
  private extractActivePending(
    history: MessageParam[],
  ): { id: string; summary: string } | null {
    const recent = history.slice(-8);
    for (let i = recent.length - 1; i >= 0; i--) {
      const msg = recent[i];
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        for (const block of msg.content as any[]) {
          if (block.type === 'tool_result' && typeof block.content === 'string') {
            try {
              const parsed = JSON.parse(block.content);
              if (parsed.requiresConfirmation === true && parsed.pendingActionId) {
                return {
                  id:      parsed.pendingActionId as string,
                  summary: (parsed.summary as string) ?? 'pending action',
                };
              }
            } catch { /* skip unparseable blocks */ }
          }
        }
      }
    }
    return null;
  }

  // -- Standard (non-streaming) path --------------------------------------

  async runChat(
    sessionId: string,
    userMessage: string,
    userId: string,
    correlationId?: string,
  ): Promise<ChatResult> {
    const history = await this.memory.loadHistory(sessionId);
    const historyLen = history.length;
    const messages: MessageParam[] = [
      ...history,
      { role: 'user', content: userMessage },
    ];

    const tools = this.toolDefs.getTools();
    const toolCallsExecuted: Array<{ tool: string; args: unknown; result: unknown }> = [];

    const activePending = this.extractActivePending(history);
    const systemMsg = this.buildSystemPrompt(activePending);

    let response = await providerAI(
      () => this.anthropic.messages.create({
        model: ClaudeOrchestratorService.MODEL,
        max_tokens: 1024,
        system: systemMsg,
        messages,
        tools,
      }),
      'anthropic.messages.create',
    );

    let assistantText = '';

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
        this.logger.log(`[${correlationId ?? sessionId}] tool_use: ${toolUse.name}`);
        let result: unknown;
        try {
          result = await this.toolExecution.execute(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            userId, sessionId, correlationId,
          );
        } catch (toolErr) {
          const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
          this.logger.error(`[${correlationId ?? sessionId}] tool "${toolUse.name}" threw: ${errMsg}`);
          result = { error: errMsg, tool: toolUse.name };
        }
        toolCallsExecuted.push({ tool: toolUse.name, args: toolUse.input, result });
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) });
      }

      messages.push({ role: 'user', content: toolResults });

      response = await providerAI(
        () => this.anthropic.messages.create({
          model: ClaudeOrchestratorService.MODEL,
          max_tokens: 1024,
          system: systemMsg,
          messages,
          tools,
        }),
        'anthropic.messages.create',
      );
    }

    const finalTextBlocks = response.content.filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
    );
    const finalResponse = finalTextBlocks.length > 0
      ? finalTextBlocks.map(b => b.text).join(' ').trim()
      : assistantText.trim() || 'I apologize, I could not generate a response.';

    const newMessages: MessageParam[] = [
      ...messages.slice(historyLen),
      { role: 'assistant', content: finalResponse },
    ];

    return { response: finalResponse, toolCalls: toolCallsExecuted, newMessages };
  }

  // -- Streaming path (CHUNK 13: fast voice pipeline) ---------------------

  /**
   * Streaming version of runChat().
   *
   * Latency improvement vs sequential pipeline:
   *
   *   Before:  [STT 3s] --> [Claude 3s full] --> [TTS 1s]  = 7s total, 7s to first audio
   *   After:   [STT 3s] --> [Claude stream: first sentence ~600ms]
   *                     --> [TTS sentence 1 starts at 600ms, done at 1s]
   *                     --> [TTS sentence 2 starts at 1.2s, done at 1.6s] (parallel)
   *                     --> [Claude finishes at 3s]
   *                     = 6s total, ~3.6s to first audio  (2x faster first audio)
   *
   * Design:
   *   - Tool-use turns use regular .create() (sequential tool execution required)
   *   - Final text turn uses .stream() so tokens arrive incrementally
   *   - Caller (VoiceService.processVoiceCommandFast) detects sentence boundaries
   *     in the yielded chunks and fires parallel TTS calls per sentence
   *   - Falls back to sync response if streaming fails
   */
  async *streamChat(
    sessionId: string,
    userMessage: string,
    userId: string,
    correlationId?: string,
  ): AsyncGenerator<string, ChatResult, unknown> {
    const history = await this.memory.loadHistory(sessionId);
    const historyLen = history.length;
    const messages: MessageParam[] = [
      ...history,
      { role: 'user', content: userMessage },
    ];

    const tools = this.toolDefs.getTools();
    const toolCallsExecuted: Array<{ tool: string; args: unknown; result: unknown }> = [];

    // Phase 1: tool-use loop (non-streaming)
    const activePending = this.extractActivePending(history);
    const systemMsg = this.buildSystemPrompt(activePending);

    let response = await providerAI(
      () => this.anthropic.messages.create({
        model: ClaudeOrchestratorService.MODEL,
        max_tokens: 1024,
        system: systemMsg,
        messages,
        tools,
      }),
      'anthropic.messages.create',
    );

    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
      );
      messages.push({ role: 'assistant', content: response.content });
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        this.logger.log(`[stream:${correlationId ?? sessionId}] tool_use: ${toolUse.name}`);
        let result: unknown;
        try {
          result = await this.toolExecution.execute(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            userId, sessionId, correlationId,
          );
        } catch (toolErr) {
          const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
          this.logger.error(`[stream:${sessionId}] tool "${toolUse.name}" threw: ${errMsg}`);
          result = { error: errMsg, tool: toolUse.name };
        }
        toolCallsExecuted.push({ tool: toolUse.name, args: toolUse.input, result });
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) });
      }

      messages.push({ role: 'user', content: toolResults });

      response = await providerAI(
        () => this.anthropic.messages.create({
          model: ClaudeOrchestratorService.MODEL,
          max_tokens: 1024,
          system: systemMsg,
          messages,
          tools,
        }),
        'anthropic.messages.create',
      );
    }

    // Phase 2: stream the final text response
    let fullText = '';

    try {
      const stream = this.anthropic.messages.stream({
        model: ClaudeOrchestratorService.MODEL,
        max_tokens: 1024,
        system: systemMsg,
        messages,
        tools,
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          const chunk = event.delta.text;
          fullText += chunk;
          yield chunk;
        }
      }

      await stream.finalMessage();

    } catch (streamErr) {
      this.logger.warn(
        `[stream:${sessionId}] stream failed, falling back to sync response: ` +
        (streamErr instanceof Error ? streamErr.message : String(streamErr)),
      );
      if (!fullText) {
        const fallback = response.content
          .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
          .map(b => b.text).join(' ').trim();
        fullText = fallback || 'I apologize, I could not generate a response.';
        yield fullText;
      }
    }

    const finalResponse = fullText.trim() || 'I apologize, I could not generate a response.';
    const newMessages: MessageParam[] = [
      ...messages.slice(historyLen),
      { role: 'assistant', content: finalResponse },
    ];

    return { response: finalResponse, toolCalls: toolCallsExecuted, newMessages };
  }
}
