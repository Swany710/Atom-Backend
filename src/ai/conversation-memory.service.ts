import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { ChatMemory } from './chat-memory.entity';

/**
 * ConversationMemoryService
 *
 * Single owner of all ChatMemory persistence.  No other service touches the
 * ChatMemory repository directly.
 *
 * Responsibilities:
 *   - Load conversation history as Anthropic MessageParam[] for the orchestrator
 *   - Persist user + assistant message pairs after each turn
 *   - Expose a single-message append for edge cases (e.g. tool-only turns)
 *   - Provide session-scoped pending-confirmation state (via in-memory map,
 *     backed by PendingActionService for durability)
 *
 * Architecture note:
 *   Text pipeline  →  ClaudeTaskOrchestratorService.runChat()
 *                     └─ calls memory.loadHistory()  (read)
 *                  →  AIVoiceService calls memory.appendPair()  (write)
 *
 *   Voice pipeline →  OpenAiVoiceGatewayService.transcribe()   (STT)
 *                  →  ClaudeTaskOrchestratorService.runChat()
 *                  →  OpenAiVoiceGatewayService.synthesise()    (TTS)
 *                  →  AIVoiceService calls memory.appendPair()  (write)
 */
@Injectable()
export class ConversationMemoryService {
  /** Max message rows loaded per turn (40 rows = 20 user/assistant exchanges). */
  static readonly HISTORY_LIMIT = 40;

  constructor(
    @InjectRepository(ChatMemory)
    private readonly repo: Repository<ChatMemory>,
  ) {}

  // ── Read ──────────────────────────────────────────────────────────────────

  /**
   * Load recent conversation history for a session as Anthropic MessageParam[].
   * Returns rows in chronological order (oldest first) so they can be passed
   * directly to the Anthropic messages array.
   *
   * Content is stored as JSON for complex messages (tool_use / tool_result
   * blocks).  Legacy plain-text rows are returned as-is (string content).
   */
  async loadHistory(
    sessionId: string,
    limit = ConversationMemoryService.HISTORY_LIMIT,
  ): Promise<MessageParam[]> {
    const rows = await this.repo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
      take: limit,
    });

    return rows.map(m => {
      // Try to deserialise JSON content (tool_use / tool_result block arrays).
      // Fall back to the raw string for legacy plain-text rows.
      let content: string | any[];
      try {
        const parsed = JSON.parse(m.content);
        content = Array.isArray(parsed) ? parsed : m.content;
      } catch {
        content = m.content;
      }
      return { role: m.role as 'user' | 'assistant', content };
    });
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Persist the full set of new MessageParam rows produced in a single turn.
   * Handles both plain-text content (string) and structured content arrays
   * (tool_use / tool_result blocks) by JSON-serialising the latter.
   *
   * This replaces appendPair() for all callers that need to preserve the full
   * tool-use conversation thread so pendingActionId survives across requests.
   */
  async appendMessages(
    sessionId: string,
    messages: MessageParam[],
  ): Promise<void> {
    const rows = messages.map(msg => ({
      sessionId,
      role: msg.role,
      content: typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content),
    }));
    await this.repo.save(rows);
  }

  /**
   * Persist a user turn and the assistant reply atomically.
   * @deprecated Use appendMessages() instead — kept for backwards compat.
   */
  async appendPair(
    sessionId: string,
    userText: string,
    assistantText: string,
  ): Promise<void> {
    await this.repo.save([
      { sessionId, role: 'user',      content: userText },
      { sessionId, role: 'assistant', content: assistantText },
    ]);
  }

  /**
   * Persist a single message (role + content) for a session.
   * Use when you need to record a user or assistant message independently
   * (e.g. tool-only turns where no assistant text was produced).
   */
  async appendSingle(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    await this.repo.save({ sessionId, role, content });
  }

  // ── Introspection ─────────────────────────────────────────────────────────

  /**
   * Count stored messages for a session.  Useful for tests and diagnostics.
   */
  async countMessages(sessionId: string): Promise<number> {
    return this.repo.count({ where: { sessionId } });
  }

  /**
   * Delete all stored messages for a session.
   * Used when the user explicitly clears a conversation.
   */
  async clearSession(sessionId: string): Promise<void> {
    await this.repo.delete({ sessionId });
  }
}
