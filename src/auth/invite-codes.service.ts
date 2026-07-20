import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { InviteCode } from './invite-code.entity';

/**
 * InviteCodesService — single-use registration invites.
 *
 * Validation order at registration:
 *   1. Table lookup: an 'active' invite code (consumed atomically on success).
 *   2. Fallback: the REGISTRATION_INVITE_CODE env var (multi-use master code),
 *      kept for backward compatibility. If neither matches, registration fails.
 *
 * If the env var is unset AND no table codes exist, registration is disabled.
 */
@Injectable()
export class InviteCodesService {
  private readonly logger = new Logger(InviteCodesService.name);

  constructor(
    @InjectRepository(InviteCode)
    private readonly repo: Repository<InviteCode>,
  ) {}

  /** Human-friendly code: AMRG-XXXX-XXXX (no ambiguous 0/O/1/I). */
  private generateCode(): string {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const pick = (n: number) =>
      Array.from(crypto.randomBytes(n)).map(b => alphabet[b % alphabet.length]).join('');
    return `AMRG-${pick(4)}-${pick(4)}`;
  }

  /**
   * Create a single-use invite code.
   * With orgId → org-bound: registrant joins that org as 'member'.
   * Without    → legacy/admin code: registrant gets a NEW org as 'owner'.
   */
  async create(label?: string, orgId?: string): Promise<InviteCode> {
    const invite = this.repo.create({
      code:   this.generateCode(),
      label:  label?.trim() || undefined,
      status: 'active',
      orgId:  orgId || undefined,
    });
    const saved = await this.repo.save(invite);
    this.logger.log(
      `Invite code created: ${saved.id} (${saved.label ?? 'no label'}${saved.orgId ? `, org ${saved.orgId}` : ''})`,
    );
    return saved;
  }

  async listAll(): Promise<InviteCode[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async revoke(id: string): Promise<{ success: boolean; error?: string }> {
    const invite = await this.repo.findOne({ where: { id } });
    if (!invite) return { success: false, error: 'Invite code not found.' };
    if (invite.status === 'used') {
      return { success: false, error: 'Code already used — revoking it has no effect.' };
    }
    invite.status = 'revoked';
    await this.repo.save(invite);
    return { success: true };
  }

  /**
   * Check whether a code is currently valid (does NOT consume it).
   * Returns the matching table row, 'env' for the master env code, or null.
   */
  async peek(code: string): Promise<InviteCode | 'env' | null> {
    if (!code?.trim()) return null;
    const trimmed = code.trim();

    const row = await this.repo.findOne({ where: { code: trimmed, status: 'active' } });
    if (row) return row;

    const master = process.env.REGISTRATION_INVITE_CODE;
    if (master && this.timingSafeEquals(trimmed, master)) return 'env';

    return null;
  }

  /** Mark a table code as consumed by a newly-registered user. */
  async consume(inviteId: string, userId: string, email: string): Promise<void> {
    await this.repo.update(
      { id: inviteId, status: 'active' },
      { status: 'used', usedByUserId: userId, usedByEmail: email, usedAt: new Date() },
    );
  }

  /** True when registration is possible at all (any active code or env master). */
  async registrationEnabled(): Promise<boolean> {
    if (process.env.REGISTRATION_INVITE_CODE) return true;
    const active = await this.repo.count({ where: { status: 'active' } });
    return active > 0;
  }

  private timingSafeEquals(a: string, b: string): boolean {
    const ha = crypto.createHash('sha256').update(a).digest();
    const hb = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
  }
}
