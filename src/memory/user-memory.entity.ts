import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type MemoryLayer = 'profile' | 'episodic' | 'task';

/**
 * UserMemory — persistent cross-session memory for the assistant.
 *
 * Three layers:
 *
 *   profile   — Stable facts about the user: name, role, preferences, working
 *               style, communication tone, timezone, tools they use.
 *               Updated rarely. Injected into every system prompt.
 *
 *   episodic  — Notable events and outcomes: "Closed the Johnson job on March 3",
 *               "User prefers morning calls", "Discussed Q1 targets with Mike".
 *               Kept for ~90 days. Used for context when relevant topics arise.
 *
 *   task      — Active in-flight tasks and their state: pending follow-ups,
 *               ongoing CRM actions, scheduled items. Cleared when resolved.
 *               Checked on every turn to surface outstanding items.
 */
@Entity('user_memory')
@Index(['userId', 'layer'])
export class UserMemory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  layer: MemoryLayer;

  /** Short machine-readable key, e.g. 'timezone', 'preferred_greeting', 'job_123_status' */
  @Column({ length: 200 })
  key: string;

  /** Human-readable content injected into the system prompt */
  @Column({ type: 'text' })
  value: string;

  /** Optional tags for filtering, e.g. ['calendar', 'crm'] */
  @Column({ type: 'simple-array', nullable: true })
  tags?: string[];

  /** Importance score 1–10 for ranking when context window is tight */
  @Column({ type: 'int', default: 5 })
  importance: number;

  /** When this memory should be discarded (null = permanent) */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
