import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * ConversationSummary — the compacted memory of everything that has fallen out
 * of a session's rolling history window.
 *
 * Why this exists:
 *   ConversationMemoryService loads only the newest HISTORY_LIMIT rows per turn.
 *   Before this table, anything older was simply gone — mid-project, with no
 *   warning to the user. Atom would forget the address of the job it had been
 *   discussing for the last twenty minutes and there was no signal that it had.
 *
 *   Now the overflow is folded into a running natural-language summary instead
 *   of dropped. loadHistory() prepends it, so the model keeps the thread even
 *   when the literal messages are long gone.
 *
 * One row per session. The summary is rewritten (not appended to) on each
 * rollover so it stays bounded — see ConversationSummarizerService.
 */
@Entity('conversation_summaries')
export class ConversationSummary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** One summary per session. */
  @Index({ unique: true })
  @Column()
  sessionId: string;

  /** Owning user, mirrored from ChatMemory for per-tenant cleanup. */
  @Column({ type: 'uuid', nullable: true })
  userId?: string;

  /** Tenant scope, mirrored from ChatMemory. */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  orgId?: string;

  /** The running natural-language summary of everything outside the window. */
  @Column({ type: 'text' })
  summary: string;

  /**
   * createdAt of the newest ChatMemory row already folded into `summary`.
   * The next rollover summarises strictly newer rows, so no message is ever
   * summarised twice and none is skipped.
   */
  @Column({ type: 'timestamptz' })
  coveredThrough: Date;

  /** Total messages folded in so far — diagnostics only. */
  @Column({ type: 'int', default: 0 })
  messageCount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
