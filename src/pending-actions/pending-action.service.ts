import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { PendingAction } from './pending-action.entity';
import { AuditService } from '../audit/audit.service';
import { OrgResolverService } from '../organizations/org-resolver.service';

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
    private readonly orgResolver: OrgResolverService,
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
      orgId:         await this.orgResolver.orgIdForUser(params.userId),
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
    // Atomic claim: a single conditional UPDATE is the ONLY thing that flips
    // 'pending' → 'confirmed'. The row lock guarantees that under concurrent
    // confirmations (double-click, client retry) exactly one call sees
    // affected === 1 and executes — closing the read-then-write (TOCTOU)
    // window where two claims could both pass a status check and double-run.
    const now = new Date();
    const claimed = await this.repo.update(
      { id: pendingActionId, userId, status: 'pending', expiresAt: MoreThan(now) },
      { status: 'confirmed' },
    );

    if (claimed.affected === 1) {
      const action = await this.repo.findOne({ where: { id: pendingActionId } });
      // Should always be present, but guard against a concurrent delete.
      if (!action) {
        return { ok: false, reason: 'not_found', message: 'Pending action not found' };
      }
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

    // affected === 0 — the claim lost the race or the record isn't claimable.
    // Re-read once to return a precise, user-facing reason.
    const action = await this.repo.findOne({ where: { id: pendingActionId } });

    if (!action || action.userId !== userId) {
      return { ok: false, reason: 'not_found', message: 'Pending action not found' };
    }

    if (action.status === 'confirmed') {
      return { ok: false, reason: 'already_confirmed', message: 'This action has already been executed' };
    }

    if (action.status === 'cancelled') {
      return { ok: false, reason: 'cancelled', message: 'This action has been cancelled' };
    }

    // status is 'pending' but the MoreThan(now) predicate excluded it, or it
    // was already marked expired — either way the window has closed.
    if (action.status === 'pending') {
      await this.repo.update({ id: action.id, status: 'pending' }, { status: 'expired' });
      this.audit.logWrite({
        action:       'pending_action_expired',
        userId,
        targetSystem: 'pending_actions',
        targetId:     action.id,
        argsSnapshot: { toolName: action.toolName },
        resultSummary: 'Expired before confirmation',
      });
    }
    return { ok: false, reason: 'expired', message: `Confirmation window expired (${PendingAction.EXPIRY_MINUTES} minutes)` };
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
