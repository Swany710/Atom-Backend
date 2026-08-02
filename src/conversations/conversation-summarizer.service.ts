import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { ChatMemory } from './chat-memory.entity';
import { ConversationSummary } from './conversation-summary.entity';
import { providerAI } from '../utils/provider-call';

/**
 * ConversationSummarizerService
 *
 * Owns the rolling summary that replaces the old history cliff.
 *
 * THE PROBLEM THIS SOLVES
 *   loadHistory() reads only the newest HISTORY_LIMIT rows. Past that point
 *   Atom simply forgot — mid-project, silently. The user would refer to
 *   something established twenty turns earlier and get a blank stare, with no
 *   indication that the context had been dropped rather than misunderstood.
 *
 * THE APPROACH
 *   After each turn is persisted, rollIfNeeded() checks whether any rows have
 *   fallen outside the window since the last roll. If so, those rows — and the
 *   previous summary — go to Claude, which returns a single replacement
 *   summary. Rewriting rather than appending keeps the summary bounded no
 *   matter how long the session runs.
 *
 *   `coveredThrough` is the createdAt of the newest row already folded in, so
 *   consecutive rolls never double-count and never skip.
 *
 * PROVIDER POLICY
 *   Claude does the reasoning (see atom provider policy — ElevenLabs speaks,
 *   Claude reasons, OpenAI is embeddings only). A small/fast model is used
 *   because summarisation is not the hard part of the product and this runs on
 *   every rollover.
 *
 * FAILURE POSTURE
 *   Summarisation is best-effort and always off the user's critical path. If
 *   Claude is down or the key is missing, we log and move on: the user gets the
 *   old truncation behaviour for that turn rather than an error. Nothing here
 *   may ever throw into a live conversation.
 */
@Injectable()
export class ConversationSummarizerService {
  private readonly logger = new Logger(ConversationSummarizerService.name);
  private readonly anthropic: Anthropic;

  /**
   * Model used for summarisation. Deliberately separate from CLAUDE_MODEL so
   * upgrading the conversational model doesn't silently change summarisation
   * cost on every rollover.
   */
  static readonly SUMMARY_MODEL =
    process.env.CLAUDE_SUMMARY_MODEL || 'claude-haiku-4-5-20251001';

  /** Output ceiling for the summary itself — keeps the prepended block small. */
  static readonly SUMMARY_MAX_TOKENS = 1024;

  /**
   * Don't roll on every single overflowed message. Waiting for a batch means
   * one Claude call per ~10 messages instead of one per turn, and produces a
   * better summary because the model sees a coherent stretch of conversation.
   */
  static readonly ROLL_BATCH_SIZE = 10;

  /**
   * Guard against a pathological session dumping thousands of rows into one
   * prompt. Anything older than the newest MAX_ROWS_PER_ROLL unsummarised rows
   * is folded in on the following roll instead.
   */
  static readonly MAX_ROWS_PER_ROLL = 120;

  /** Per-session in-flight lock — two turns landing at once must not both roll. */
  private readonly rolling = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(ChatMemory)
    private readonly messages: Repository<ChatMemory>,
    @InjectRepository(ConversationSummary)
    private readonly summaries: Repository<ConversationSummary>,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  /** The current rolling summary for a session, or null if nothing has rolled. */
  async getSummary(sessionId: string): Promise<string | null> {
    const row = await this.summaries.findOne({ where: { sessionId } });
    return row?.summary ?? null;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Fold newly-overflowed messages into the session summary, if enough have
   * accumulated. Safe to call after every turn.
   *
   * NEVER THROWS. Callers are on the user's request path.
   *
   * @param windowSize how many newest rows loadHistory() keeps verbatim —
   *                   anything older than these is eligible for summarisation.
   */
  async rollIfNeeded(sessionId: string, windowSize: number): Promise<void> {
    if (this.rolling.has(sessionId)) return;
    this.rolling.add(sessionId);
    try {
      await this.roll(sessionId, windowSize);
    } catch (err) {
      // Degrade to the old truncation behaviour rather than break the turn.
      this.logger.warn(
        `[${sessionId}] history summarisation failed (history will truncate ` +
        `for this session until the next successful roll): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      this.rolling.delete(sessionId);
    }
  }

  private async roll(sessionId: string, windowSize: number): Promise<void> {
    // The rows loadHistory() will keep verbatim. Everything strictly older is
    // out of the window and must be represented by the summary instead.
    const windowRows = await this.messages.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      take: windowSize,
      select: { createdAt: true },
    });

    // Session hasn't filled the window yet — nothing has been lost.
    if (windowRows.length < windowSize) return;

    const windowStartsAt = windowRows[windowRows.length - 1].createdAt;

    const existing = await this.summaries.findOne({ where: { sessionId } });
    const since = existing?.coveredThrough ?? new Date(0);

    // Rows that are (a) older than the window and (b) not yet summarised.
    const pending = await this.messages.find({
      where: {
        sessionId,
        createdAt: MoreThan(since),
      },
      order: { createdAt: 'ASC' },
    });
    const overflow = pending.filter(r => r.createdAt < windowStartsAt);

    if (overflow.length < ConversationSummarizerService.ROLL_BATCH_SIZE) return;

    // Cap a single roll so one prompt can't blow up on a huge backlog.
    const batch = overflow.slice(0, ConversationSummarizerService.MAX_ROWS_PER_ROLL);

    const summary = await this.summarise(existing?.summary ?? null, batch);
    if (!summary) return; // model returned nothing usable — leave state untouched

    const newest = batch[batch.length - 1];

    if (existing) {
      existing.summary        = summary;
      existing.coveredThrough = newest.createdAt;
      existing.messageCount   = existing.messageCount + batch.length;
      existing.userId       ??= newest.userId;
      existing.orgId        ??= newest.orgId;
      await this.summaries.save(existing);
    } else {
      await this.summaries.save(
        this.summaries.create({
          sessionId,
          userId:         newest.userId,
          orgId:          newest.orgId,
          summary,
          coveredThrough: newest.createdAt,
          messageCount:   batch.length,
        }),
      );
    }

    this.logger.log(
      `[${sessionId}] rolled ${batch.length} message(s) into the session ` +
      `summary (${summary.length} chars, ${
        (existing?.messageCount ?? 0) + batch.length
      } total summarised)`,
    );
  }

  /**
   * Ask Claude to merge the previous summary with a batch of newly-overflowed
   * messages into one replacement summary.
   *
   * Returns null when the model produces nothing usable, which the caller
   * treats as "leave the stored summary alone".
   */
  private async summarise(
    previous: string | null,
    batch: ChatMemory[],
  ): Promise<string | null> {
    if (!this.config.get<string>('ANTHROPIC_API_KEY')) {
      this.logger.warn('ANTHROPIC_API_KEY not set — skipping history summarisation');
      return null;
    }

    const transcript = batch.map(r => `${r.role.toUpperCase()}: ${this.plainText(r.content)}`)
      .join('\n')
      .slice(0, 60_000); // hard character ceiling; MAX_ROWS_PER_ROLL rarely reaches it

    const priorBlock = previous
      ? `Here is the running summary of everything before this excerpt:\n\n${previous}\n\n`
      : '';

    const prompt =
      `${priorBlock}Here is the next stretch of the same conversation:\n\n` +
      `${transcript}\n\n` +
      `Write a single replacement summary covering BOTH the running summary above ` +
      `(if present) and this new excerpt. This summary is the assistant's only ` +
      `memory of these turns once they scroll out of the live window, so it must ` +
      `carry forward anything the conversation still depends on:\n` +
      `  - concrete facts: names, addresses, job numbers, dates, amounts, phone numbers\n` +
      `  - decisions made and commitments given\n` +
      `  - open threads and anything the user asked for that is not finished\n` +
      `  - the user's stated preferences and corrections\n` +
      `Drop pleasantries, restatements, and tool mechanics. Preserve exact values ` +
      `verbatim — never round, approximate, or paraphrase a number, address, or name. ` +
      `Write terse third-person notes, not prose. Output only the summary.`;

    const res = await providerAI(
      () => this.anthropic.messages.create({
        model:      ConversationSummarizerService.SUMMARY_MODEL,
        max_tokens: ConversationSummarizerService.SUMMARY_MAX_TOKENS,
        messages:   [{ role: 'user', content: prompt }],
      }),
      'anthropic.messages.create[summary]',
    );

    const text = res.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    return text.length > 0 ? text : null;
  }

  /**
   * Flatten a stored ChatMemory row into readable text.
   * Structured rows (tool_use / tool_result arrays) are JSON; we want the
   * human-meaningful parts, not the block scaffolding.
   */
  private plainText(content: string): string {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return content;
    }
    if (!Array.isArray(parsed)) return content;

    const parts: string[] = [];
    for (const block of parsed as any[]) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        parts.push(block.text);
      } else if (block?.type === 'tool_use') {
        parts.push(`[called ${block.name} with ${JSON.stringify(block.input)}]`);
      } else if (block?.type === 'tool_result') {
        const c = typeof block.content === 'string'
          ? block.content
          : JSON.stringify(block.content);
        parts.push(`[result: ${(c ?? '').slice(0, 2_000)}]`);
      }
    }
    return parts.join(' ') || content;
  }

  /** Remove a session's summary. Called alongside ChatMemory cleanup. */
  async clearSession(sessionId: string): Promise<void> {
    await this.summaries.delete({ sessionId });
  }
}
