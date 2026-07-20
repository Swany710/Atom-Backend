import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type ScheduledTaskStatus = 'pending' | 'executed' | 'cancelled' | 'failed';

/**
 * ScheduledTask
 *
 * Stores a future action that the user asked Atom to perform at a specific time.
 *
 * Examples:
 *   "Send a reminder email to John Smith at 9am tomorrow"
 *   "Email the homeowner on Friday at 3pm about their roof inspection"
 *
 * Flow:
 *   1. User asks Atom to schedule a task in natural language.
 *   2. Claude calls the `schedule_task` tool with taskType, args, scheduledAt.
 *   3. ScheduledTaskService.create() writes a record here with status='pending'.
 *   4. The cron job (runs every minute) picks up tasks where scheduledAt <= NOW()
 *      and status='pending', executes them, then marks them 'executed' or 'failed'.
 */
@Entity('scheduled_tasks')
@Index(['userId', 'status', 'scheduledAt'])
export class ScheduledTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The authenticated user who owns this task */
  @Column()
  userId: string;

  /** Tenant scope (nullable until tenancy migration 009 tightens) */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  orgId?: string;

  /**
   * The tool/action to run — mirrors ToolDefinitionsService tool names.
   * Supported: 'send_email'
   */
  @Column()
  taskType: string;

  /** Human-readable description shown to the user (e.g. "Send reminder to John Smith") */
  @Column({ type: 'text' })
  description: string;

  /** When to execute this task (stored as UTC timestamptz) */
  @Column({ type: 'timestamptz' })
  scheduledAt: Date;

  @Column({ default: 'pending' })
  status: ScheduledTaskStatus;

  /**
   * The arguments to pass to the task executor.
   * Shape matches the tool's input_schema (e.g. for send_email: { to, subject, body })
   */
  @Column({ type: 'jsonb' })
  args: Record<string, unknown>;

  /** Written back after execution (success message or error detail) */
  @Column({ type: 'text', nullable: true })
  resultSummary?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
