import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PendingActionService } from '../pending-action.service';
import { PendingAction, PendingActionStatus } from '../pending-action.entity';
import { AuditService } from '../../audit/audit.service';

// ── Helpers ────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-abc';
const TOOL    = 'send_email';
const SUMMARY = 'Send email to john@example.com';
const ARGS    = { to: 'john@example.com', subject: 'Hi', body: 'Hello' };

function futureDate(minutesFromNow: number): Date {
  return new Date(Date.now() + minutesFromNow * 60 * 1000);
}

function pastDate(minutesAgo: number): Date {
  return new Date(Date.now() - minutesAgo * 60 * 1000);
}

function makeAction(overrides: Partial<PendingAction> = {}): PendingAction {
  return Object.assign(new PendingAction(), {
    id:            'action-uuid-123',
    userId:        USER_ID,
    toolName:      TOOL,
    args:          ARGS,
    summary:       SUMMARY,
    status:        'pending' as PendingActionStatus,
    sessionId:     'session-1',
    correlationId: 'corr-1',
    expiresAt:     futureDate(5),
    createdAt:     new Date(),
    ...overrides,
  });
}

function makeRepo() {
  return {
    create:  jest.fn(),
    save:    jest.fn(),
    findOne: jest.fn(),
    update:  jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

// Helper: extracts .reason from an error result without TS union complaint
function reason(result: any): string {
  return result.reason;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PendingActionService', () => {
  let service: PendingActionService;
  let repo: ReturnType<typeof makeRepo>;
  let audit: { logWrite: jest.Mock };

  beforeEach(async () => {
    repo  = makeRepo();
    audit = { logWrite: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PendingActionService,
        { provide: getRepositoryToken(PendingAction), useValue: repo },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<PendingActionService>(PendingActionService);
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('returns a ConfirmationRequired shape', async () => {
      const action = makeAction();
      repo.create.mockReturnValue(action);
      repo.save.mockResolvedValue(action);

      const result = await service.create({ userId: USER_ID, toolName: TOOL, args: ARGS, summary: SUMMARY });

      expect(result.requiresConfirmation).toBe(true);
      expect(result.pendingActionId).toBe(action.id);
      expect(result.toolName).toBe(TOOL);
      expect(result.summary).toBe(SUMMARY);
      expect(result.expiresAt).toBeDefined();
    });

    it('sets expiresAt to ~5 minutes from now', async () => {
      const action = makeAction();
      repo.create.mockReturnValue(action);
      repo.save.mockResolvedValue(action);

      const before = Date.now();
      const result = await service.create({ userId: USER_ID, toolName: TOOL, args: ARGS, summary: SUMMARY });
      const after  = Date.now();

      const expires    = new Date(result.expiresAt).getTime();
      const expectedMs = PendingAction.EXPIRY_MINUTES * 60 * 1000;
      expect(expires).toBeGreaterThanOrEqual(before + expectedMs - 200);
      expect(expires).toBeLessThanOrEqual(after  + expectedMs + 200);
    });

    it('emits a pending_action_created audit log', async () => {
      const action = makeAction();
      repo.create.mockReturnValue(action);
      repo.save.mockResolvedValue(action);

      await service.create({ userId: USER_ID, toolName: TOOL, args: ARGS, summary: SUMMARY });

      expect(audit.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'pending_action_created', userId: USER_ID }),
      );
    });
  });

  // ── claim — happy path ────────────────────────────────────────────────────

  describe('claim — success', () => {
    it('returns ok:true with the action on a valid pending claim', async () => {
      const action = makeAction();
      repo.findOne.mockResolvedValue(action);

      const result = await service.claim(action.id, USER_ID);

      expect(result.ok).toBe(true);
      expect((result as any).action.id).toBe(action.id);
    });

    it('marks the action as confirmed in the database', async () => {
      const action = makeAction();
      repo.findOne.mockResolvedValue(action);

      await service.claim(action.id, USER_ID);

      expect(repo.update).toHaveBeenCalledWith(action.id, { status: 'confirmed' });
    });

    it('emits a pending_action_confirmed audit log', async () => {
      const action = makeAction();
      repo.findOne.mockResolvedValue(action);

      await service.claim(action.id, USER_ID);

      expect(audit.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'pending_action_confirmed', userId: USER_ID }),
      );
    });
  });

  // ── claim — error paths ───────────────────────────────────────────────────

  describe('claim — not_found', () => {
    it('returns not_found when action does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.claim('nonexistent-id', USER_ID);

      expect(result.ok).toBe(false);
      expect(reason(result)).toBe('not_found');
    });

    it('returns not_found when userId does not match (prevents cross-user claims)', async () => {
      const action = makeAction({ userId: 'other-user-id' });
      repo.findOne.mockResolvedValue(action);

      const result = await service.claim(action.id, USER_ID);

      expect(result.ok).toBe(false);
      expect(reason(result)).toBe('not_found');
    });
  });

  describe('claim — already_confirmed', () => {
    it('returns already_confirmed when action was already claimed', async () => {
      const action = makeAction({ status: 'confirmed' });
      repo.findOne.mockResolvedValue(action);

      const result = await service.claim(action.id, USER_ID);

      expect(result.ok).toBe(false);
      expect(reason(result)).toBe('already_confirmed');
    });
  });

  describe('claim — expired', () => {
    it('returns expired when the record status is already expired', async () => {
      const action = makeAction({ status: 'expired' });
      repo.findOne.mockResolvedValue(action);

      const result = await service.claim(action.id, USER_ID);

      expect(result.ok).toBe(false);
      expect(reason(result)).toBe('expired');
    });

    it('returns expired and updates status when expiresAt is in the past', async () => {
      const action = makeAction({ expiresAt: pastDate(10) });
      repo.findOne.mockResolvedValue(action);

      const result = await service.claim(action.id, USER_ID);

      expect(result.ok).toBe(false);
      expect(reason(result)).toBe('expired');
      expect(repo.update).toHaveBeenCalledWith(action.id, { status: 'expired' });
    });

    it('emits pending_action_expired audit on clock-based expiry', async () => {
      const action = makeAction({ expiresAt: pastDate(10) });
      repo.findOne.mockResolvedValue(action);

      await service.claim(action.id, USER_ID);

      expect(audit.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'pending_action_expired' }),
      );
    });
  });

  describe('claim — cancelled', () => {
    it('returns cancelled when action status is cancelled', async () => {
      const action = makeAction({ status: 'cancelled' });
      repo.findOne.mockResolvedValue(action);

      const result = await service.claim(action.id, USER_ID);

      expect(result.ok).toBe(false);
      expect(reason(result)).toBe('cancelled');
    });
  });

  // ── recordResult ──────────────────────────────────────────────────────────

  describe('recordResult', () => {
    it('updates the resultSummary on the record', async () => {
      await service.recordResult('action-id', 'Email sent successfully');

      expect(repo.update).toHaveBeenCalledWith('action-id', { resultSummary: 'Email sent successfully' });
    });
  });

  // ── expireStale ───────────────────────────────────────────────────────────

  describe('expireStale', () => {
    it('returns the count of affected rows', async () => {
      repo.update.mockResolvedValue({ affected: 3 });
      const count = await service.expireStale();
      expect(count).toBe(3);
    });

    it('returns 0 when no rows were affected', async () => {
      repo.update.mockResolvedValue({ affected: 0 });
      const count = await service.expireStale();
      expect(count).toBe(0);
    });
  });

  // ── full confirmation flow (end-to-end unit) ──────────────────────────────

  describe('full confirmation flow', () => {
    it('create → claim succeeds once, replay is rejected', async () => {
      // Step 1: create
      const action = makeAction();
      repo.create.mockReturnValue(action);
      repo.save.mockResolvedValue(action);

      const confirmation = await service.create({
        userId: USER_ID, toolName: TOOL, args: ARGS, summary: SUMMARY,
      });
      expect(confirmation.requiresConfirmation).toBe(true);

      // Step 2: user confirms → first claim succeeds
      repo.findOne.mockResolvedValue(action);
      const first = await service.claim(confirmation.pendingActionId, USER_ID);
      expect(first.ok).toBe(true);

      // Step 3: replay attempt → already_confirmed
      repo.findOne.mockResolvedValue(makeAction({ status: 'confirmed' }));
      const replay = await service.claim(confirmation.pendingActionId, USER_ID);
      expect(replay.ok).toBe(false);
      expect(reason(replay)).toBe('already_confirmed');
    });

    it('expired action cannot be confirmed', async () => {
      const action = makeAction();
      repo.create.mockReturnValue(action);
      repo.save.mockResolvedValue(action);

      const confirmation = await service.create({
        userId: USER_ID, toolName: TOOL, args: ARGS, summary: SUMMARY,
      });

      // Action expires before user confirms
      repo.findOne.mockResolvedValue(makeAction({ expiresAt: pastDate(1) }));
      const result = await service.claim(confirmation.pendingActionId, USER_ID);
      expect(result.ok).toBe(false);
      expect(reason(result)).toBe('expired');
    });

    it('cross-user claim is blocked', async () => {
      const action = makeAction({ userId: 'attacker-id' });
      repo.findOne.mockResolvedValue(action);

      const result = await service.claim(action.id, USER_ID);
      expect(result.ok).toBe(false);
      expect(reason(result)).toBe('not_found');
    });
  });
});
