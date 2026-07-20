import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduledTask } from './scheduled-task.entity';
import { EMAIL_PROVIDER, IEmailService } from '../integrations/email/email.provider';
import { OrgResolverService } from '../organizations/org-resolver.service';

export interface CreateScheduledTaskDto {
  userId: string;
  taskType: string;
  description: string;
  scheduledAt: Date;
  args: Record<string, unknown>;
}

/**
 * ScheduledTaskService
 *
 * Manages future tasks that Atom will execute on the user's behalf.
 *
 * Responsibilities:
 *   - CRUD for scheduled tasks (create, list, cancel, get)
 *   - Cron-based executor: every minute, pick up due tasks and run them
 *
 * Supported task types:
 *   - 'send_email'  — send an email via the user's connected Gmail/Outlook
 *
 * The executor is intentionally simple: it calls the relevant service directly
 * using the args stored at scheduling time. No re-confirmation is needed since
 * the user explicitly asked to schedule the action.
 */
@Injectable()
export class ScheduledTaskService {
  private readonly logger = new Logger(ScheduledTaskService.name);

  constructor(
    @InjectRepository(ScheduledTask)
    private readonly repo: Repository<ScheduledTask>,
    @Inject(EMAIL_PROVIDER)
    private readonly emailService: IEmailService,
    private readonly orgResolver: OrgResolverService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async create(dto: CreateScheduledTaskDto): Promise<ScheduledTask> {
    const task = this.repo.create({
      userId:      dto.userId,
      orgId:       await this.orgResolver.orgIdForUser(dto.userId),
      taskType:    dto.taskType,
      description: dto.description,
      scheduledAt: dto.scheduledAt,
      args:        dto.args,
      status:      'pending',
    });
    const saved = await this.repo.save(task);
    this.logger.log(
      `Scheduled task created: id=${saved.id} type=${saved.taskType} ` +
      `at=${saved.scheduledAt.toISOString()} user=${saved.userId}`,
    );
    return saved;
  }

  async list(userId: string): Promise<ScheduledTask[]> {
    return this.repo.find({
      where: { userId },
      order: { scheduledAt: 'ASC' },
    });
  }

  async listPending(userId: string): Promise<ScheduledTask[]> {
    return this.repo.find({
      where: { userId, status: 'pending' },
      order: { scheduledAt: 'ASC' },
    });
  }

  async cancel(taskId: string, userId: string): Promise<{ ok: boolean; message: string }> {
    const task = await this.repo.findOne({ where: { id: taskId, userId } });
    if (!task) {
      return { ok: false, message: 'Task not found or does not belong to you.' };
    }
    if (task.status !== 'pending') {
      return { ok: false, message: `Cannot cancel a task with status '${task.status}'.` };
    }
    task.status = 'cancelled';
    await this.repo.save(task);
    this.logger.log(`Task cancelled: id=${taskId} user=${userId}`);
    return { ok: true, message: `Scheduled task "${task.description}" has been cancelled.` };
  }

  // ── Cron executor ─────────────────────────────────────────────────────────

  /**
   * Runs every minute. Finds all pending tasks whose scheduledAt is in the
   * past (or right now) and executes them one by one.
   *
   * Uses a simple row-level select-then-update approach; suitable for a
   * single-instance deployment. For multi-instance, a SELECT FOR UPDATE SKIP
   * LOCKED pattern would be preferred.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async executeDueTasks(): Promise<void> {
    const now = new Date();
    const dueTasks = await this.repo.find({
      where: {
        status:      'pending',
        scheduledAt: LessThanOrEqual(now),
      },
    });

    if (dueTasks.length === 0) return;

    this.logger.log(`Executing ${dueTasks.length} due scheduled task(s)`);

    for (const task of dueTasks) {
      await this.executeTask(task);
    }
  }

  private async executeTask(task: ScheduledTask): Promise<void> {
    this.logger.log(`Executing scheduled task: id=${task.id} type=${task.taskType} user=${task.userId}`);

    // Mark as executing immediately to prevent double-execution if the
    // cron fires again before the current execution completes.
    task.status = 'executed'; // optimistic — roll back to 'failed' if it throws
    await this.repo.save(task);

    try {
      const result = await this.dispatchTask(task);
      const summary = typeof result === 'object' && result !== null
        ? JSON.stringify(result).slice(0, 300)
        : String(result);
      task.resultSummary = `OK: ${summary}`;
      this.logger.log(`Task executed successfully: id=${task.id}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      task.status        = 'failed';
      task.resultSummary = `FAILED: ${errMsg}`;
      this.logger.error(`Task failed: id=${task.id} error=${errMsg}`);
    }

    await this.repo.save(task);
  }

  private async dispatchTask(task: ScheduledTask): Promise<unknown> {
    const args = task.args;

    switch (task.taskType) {
      case 'send_email': {
        const to      = args.to as string[];
        const subject = args.subject as string;
        const body    = args.body as string;
        const cc      = args.cc as string[] | undefined;

        if (!to || !subject || !body) {
          throw new Error('send_email task missing required args: to, subject, body');
        }

        return this.emailService.sendEmail(
          to, subject, body,
          false,       // draftOnly = false — we want to actually send it
          cc,
          undefined,   // replyToMessageId
          undefined,   // threadId
          task.userId,
        );
      }

      default:
        throw new Error(`Unsupported scheduled task type: ${task.taskType}`);
    }
  }
}
