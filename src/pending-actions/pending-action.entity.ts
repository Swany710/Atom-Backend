import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type PendingActionStatus = 'pending' | 'confirmed' | 'expired' | 'cancelled';

/**
 * PendingAction
 *
 * Every backend-enforced write action (send_email, delete_email, create_calendar_event, …)
 * creates a record here before any provider call happens.
 *
 * Flow:
 *   1. executeFunctionCall sees a write tool with no pendingActionId
 *      → creates PendingAction(status='pending'), returns { requiresConfirmation: true, … }
 *   2. AI returns confirmation prompt to user
 *   3. User says "yes / confirmed / go ahead"
 *   4. AI calls the tool again with pendingActionId = <id>
 *   5. executeFunctionCall finds the record, checks status='pending' & not expired
 *      → marks it 'confirmed', executes the real provider call, records result
 *
 * Records expire after EXPIRY_MINUTES (default 5) so stale confirmations cannot be replayed.
 */
@Entity('pending_actions')
@Index(['userId', 'status'])
export class PendingAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  /** Tool name (e.g. 'send_email') */
  @Column()
  toolName: string;

  /** JSON snapshot of the tool args — stored so we can re-execute without re-trusting input */
  @Column({ type: 'jsonb' })
  args: Record<string, unknown>;

  /** Human-readable summary shown to the user in the confirmation prompt */
  @Column({ type: 'text' })
  summary: string;

  @Column({ default: 'pending' })
  status: PendingActionStatus;

  /** Conversation/session that created this pending action */
  @Column({ nullable: true })
  sessionId?: string;

  /** Correlation ID from the originating request */
  @Column({ nullable: true })
  correlationId?: string;

  /** Result summary written back after successful execution */
  @Column({ type: 'text', nullable: true })
  resultSummary?: string;

  @CreateDateColumn()
  createdAt: Date;

  /** When this pending action expires — set on creation */
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Minutes a pending action is valid for */
  static readonly EXPIRY_MINUTES = 5;
}
