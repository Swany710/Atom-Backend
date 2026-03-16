import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { ChatMemory } from './chat-memory.entity';

/**
 * ConversationMemoryService
 *
 * Single owner of all ChatMemory persistence.
 *
 * Responsibilities:
 *   - Load conversation history as Anthropic MessageParam[] for the orchestrator
 *   - Sanitize history to remove orphaned tool_use/tool_result pairs that
 *     result from interrupted requests (prevents Anthropic 400 errors)
 *   - Persist the full new-message set after each turn (appendMessages)
 *   - Return raw entity rows for the history API endpoint (getRawMessages)
 *   - Clear a session on demand (clearSession)
 */
@Injectable()
export class ConversationMemoryService {
  /** Max message rows loaded per turn (40 rows = ~20 user/assistant exchanges). */
  static readonly HISTORY_LIMIT = 40;

  private readonly logger = new Logger(ConversationMemoryService.name);

  constructor(
    @InjectRepository(ChatMemory)
    private readonly repo: Repository<ChatMemory>,
  ) {}

  // ── Read ──────────────────────────────────────────────────────────────────

  /**
   * Load recent conversation history for a session as Anthropic MessageParam[].
   * Runs sanitizeHistory() before returning so that orphaned tool pairs from
   * interrupted requests never reach the Anthropic API.
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

    const raw: MessageParam[] = rows.map(m => {
      let content: string | any[];
      try {
        const parsed = JSON.parse(m.content);
        content = Array.isArray(parsed) ? parsed : m.content;
      } catch {
        content = m.content;
      }
      return { role: m.role as 'user' | 'assistant', content };
    });

    return this.sanitizeHistory(sessionId, raw);
  }

  /**
   * Remove orphaned tool_use / tool_result blocks that result from interrupted
   * requests. An interrupted turn leaves the history in one of these broken states:
   *
   *   A) assistant message has tool_use blocks  →  no following user tool_result
   *   B) user message has tool_result blocks    →  no preceding assistant tool_use
   *
   * Either state causes Anthropic to return HTTP 400:
   *   "unexpected tool_use_id found in tool_result blocks"
   *
   * Strategy:
   *   1. Walk backwards from the end of history.
   *   2. If the last assistant message contains any tool_use blocks with no
   *      matching tool_result in the next user message → drop that assistant
   *      message and everything after it.
   *   3. If the last user message contains tool_result blocks with no matching
   *      preceding assistant tool_use → drop that user message.
   *   4. Repeat until the tail is clean.
   *   5. Ensure history always ends with either an assistant message or nothing
   *      (never ends on a user message — that's what the new user input is for).
   */
  private sanitizeHistory(sessionId: string, messages: MessageParam[]): MessageParam[] {
    let msgs = [...messages];
    let changed = false;

    // ── Phase 1: Forward pass across all message pairs ────────────────────
    // An assistant message with tool_use blocks MUST be immediately followed
    // by a user message with matching tool_result blocks. If not, truncate
    // history at that point (preserve all clean messages before it).
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      if (msg.role !== 'assistant') continue;

      const content = Array.isArray(msg.content) ? msg.content : [];
      const toolUseBlocks = content.filter((b: any) => b.type === 'tool_use');
      if (toolUseBlocks.length === 0) continue;

      // This assistant message has tool_use blocks – verify next message is a matching tool_result
      const next = msgs[i + 1];
      let isValid = false;
      if (next && next.role === 'user') {
        const nextContent = Array.isArray(next.content) ? next.content : [];
        const resultIds = new Set(
          nextContent
            .filter((b: any) => b.type === 'tool_result')
            .map((b: any) => b.tool_use_id),
        );
        isValid = toolUseBlocks.every((b: any) => resultIds.has(b.id));
      }

      if (!isValid) {
        this.logger.warn(
          `[${sessionId}] Truncating history at message ${i}: orphaned tool_use (no matching tool_result follows)`,
        );
        msgs = msgs.slice(0, i);
        changed = true;
        break;
      }
    }

    // ── Phase 2: Tail-trim any residual corrupt state ─────────────────────
    let safety = 20;
    while (safety-- > 0) {
      const len = msgs.length;
      if (len === 0) break;

      const last = msgs[len - 1];

      // Case A: last message is assistant with unresolved tool_use
      if (last.role === 'assistant') {
        const content = Array.isArray(last.content) ? last.content : [];
        const hasToolUse = content.some((b: any) => b.type === 'tool_use');
        if (hasToolUse) {
          this.logger.warn(
            `[${sessionId}] Dropping orphaned assistant tool_use at tail (interrupted turn)`,
          );
          msgs = msgs.slice(0, len - 1);
          changed = true;
          continue;
        }
      }

      // Case B: last message is user with unmatched tool_result
      if (last.role === 'user') {
        const content = Array.isArray(last.content) ? last.content : [];
        const hasToolResult = content.some((b: any) => b.type === 'tool_result');
        if (hasToolResult) {
          const prevAssistant = msgs.slice(0, len - 1).reverse().find(m => m.role === 'assistant');
          const prevContent = prevAssistant && Array.isArray(prevAssistant.content)
            ? prevAssistant.content
            : [];
          const toolUseIds = new Set(
            prevContent
              .filter((b: any) => b.type === 'tool_use')
              .map((b: any) => b.id),
          );
          const resultIds = content
            .filter((b: any) => b.type === 'tool_result')
            .map((b: any) => b.tool_use_id);
          const allMatched = resultIds.every((id: string) => toolUseIds.has(id));

          if (!allMatched) {
            this.logger.warn(
              `[${sessionId}] Dropping orphaned user tool_result at tail (unmatched tool_use_id)`,
            );
            msgs = msgs.slice(0, len - 1);
            changed = true;
            continue;
          }
        }
      }

      // Tail is clean
      break;
    }

    // ── Final rule: history must not end on a tool_result user message ─────
    while (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') {
      const content = msgs[msgs.length - 1].content;
      const isToolResult = Array.isArray(content) &&
        content.some((b: any) => b.type === 'tool_result');
      if (isToolResult) {
        msgs = msgs.slice(0, -1);
        changed = true;
      } else {
        break;
      }
    }

    if (changed) {
      this.logger.log(
        `[${sessionId}] History sanitized: ${messages.length} -> ${msgs.length} messages`,
      );
    }

    return msgs;
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
   * Count stored messages for a session. Useful for tests and diagnostics.
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
