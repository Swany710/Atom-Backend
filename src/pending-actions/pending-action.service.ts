import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { PendingAction } from './pending-action.entity';
import { AuditService } from '../audit/audit.service';

export interface ConfirmationRequired {
  requiresConfirmation: true;
  pendingActionId: string;
  toolName: string;
  summary: string;
  expiresAt: string;
}

export interface PendingActionResult {
  ok: true;
  action: PendingAction;
}

export interface PendingActionError {
  ok: false;
  reason: 'not_found' | 'already_confirmed' | 'expired' | 'cancelled';
  message: string;
}

@Injectable()
export class PendingActionService {
  private readonly logger = new Logger(PendingActionService.name);

  constructor(
    @InjectRepository(PendingAction)
    private readonly repo: Repository<PendingAction>,
    private readonly audit: AuditService,
  ) {}

  /**
   * Create a pending action record.
   * Returns the ConfirmationRequired shape that gets returned to the AI
   * so it can prompt the user.
   */
  async create(params: {
    userId: string;
    toolName: string;
    args: Record<string, unknown>;
    summary: string;
    sessionId?: string;
    correlationId?: string;
  }): Promise<ConfirmationRequired> {
    const expiresAt = new Date(
      Date.now() + PendingAction.EXPIRY_MINUTES * 60 * 1000,
    );

    const action = this.repo.create({
      userId:        params.userId,
      toolName:      params.toolName,
      args:          params.args,
      summary:       params.summary,
      status:        'pending',
      sessionId:     params.sessionId,
      correlationId: params.correlationId,
      expiresAt,
    });

    const saved = await this.repo.save(action);

    this.audit.logWrite({
      action:        'pending_action_created',
      userId:        params.userId,
      correlationId: params.correlationId,
      targetSystem:  'pending_actions',
      targetId:      saved.id,
      argsSnapshot:  { toolName: params.toolName },
      resultSummary: `Pending action created: ${params.summary}`,
    });

    this.logger.log(`PendingAction created: ${saved.id} (${params.toolName}) for user ${params.userId}`);

    return {
      requiresConfirmation: true,
      pendingActionId:      saved.id,
      toolName:             params.toolName,
      summary:              params.summary,
      expiresAt:            expiresAt.toISOString(),
    };
  }

  /**
   * Validate and claim a pending action for execution.
   * Returns the action on success, or an error descriptor.
   * On success the record is atomically moved to 'confirmed'.
   */
  async claim(
    pendingActionId: string,
    userId: string,
  ): Promise<PendingActionResult | PendingActionError> {
    const action = await this.repo.findOne({ where: { id: pendingActionId } });

    if (!action || action.userId !== userId) {
      return { ok: false, reason: 'not_found', message: 'Pending action not found' };
    }

    if (action.status === 'confirmed') {
      return { ok: false, reason: 'already_confirmed', message: 'This action has already been executed' };
    }

    if (action.status === 'expired' || action.status === 'cancelled') {
      return { ok: false, reason: action.status, message: `This action has been ${action.status}` };
    }

    if (new Date() > action.expiresAt) {
      await this.repo.update(action.id, { status: 'expired' });
      this.audit.logWrite({
        action:       'pending_action_expired',
        userId,
        targetSystem: 'pending_actions',
        targetId:     action.id,
        argsSnapshot: { toolName: action.toolName },
        resultSummary: 'Expired before confirmation',
      });
      return { ok: false, reason: 'expired', message: `Confirmation window expired (${PendingAction.EXPIRY_MINUTES} minutes)` };
    }

    // Mark confirmed — prevents double-execution
    await this.repo.update(action.id, { status: 'confirmed' });
    action.status = 'confirmed';

    this.audit.logWrite({
      action:       'pending_action_confirmed',
      userId,
      targetSystem: 'pending_actions',
      targetId:     action.id,
      argsSnapshot: { toolName: action.toolName },
      resultSummary: 'Confirmed by user',
    });

    return { ok: true, action };
  }

  /** Record the result of a confirmed execution */
  async recordResult(id: string, resultSummary: string): Promise<void> {
    await this.repo.update(id, { resultSummary });
  }

  /** Periodic cleanup — called by a cron or health check */
  async expireStale(): Promise<number> {
    const result = await this.repo.update(
      { status: 'pending', expiresAt: LessThan(new Date()) },
      { status: 'expired' },
    );
    return result.affected ?? 0;
  }
}
