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
 *   - Persist the full new-message set after each turn (appendMessages)
 *   - Return raw entity rows for the history API endpoint (getRawMessages)
 *   - Clear a session on demand (clearSession)
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

  /**
   * Return raw ChatMemory entity rows for a session (used by the history API).
   * Ordered chronologically, no limit.
   */
  async getRawMessages(sessionId: string): Promise<ChatMemory[]> {
    return this.repo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Persist the full set of new MessageParam rows produced in a single turn.
   * Handles both plain-text content (string) and structured content arrays
   * (tool_use / tool_result blocks) by JSON-serialising the latter.
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
   * Count stored messages for a session.  Useful for tests and diagnostics.
   */
  async countMessages(sessionId: string): Promise<number> {
    return this.repo.count({ where: { sessionId } });
  }

  /**
   * Delete all stored messages for a session.
   */
  async clearSession(sessionId: string): Promise<void> {
    await this.repo.delete({ sessionId });
  }
}
