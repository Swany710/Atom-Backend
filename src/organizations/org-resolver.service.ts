import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { TenantContextService } from './tenant-context.service';

/**
 * OrgResolverService — resolves the orgId to stamp on new rows.
 *
 * Order:
 *  1. TenantContext (normal authenticated request) — free.
 *  2. users table lookup by userId (public OAuth callbacks, cron executors,
 *     anywhere AsyncLocalStorage isn't populated) — cached 5 min.
 *
 * Returns undefined for unknown users (e.g. 'dev-user') — columns stay
 * nullable until migration 009, and post-tighten every real user has an org.
 */
@Injectable()
export class OrgResolverService {
  private readonly logger = new Logger(OrgResolverService.name);
  private readonly cache = new Map<string, { orgId?: string; at: number }>();
  private static readonly TTL_MS = 5 * 60_000;

  constructor(
    private readonly tenantContext: TenantContextService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async orgIdForUser(userId: string): Promise<string | undefined> {
    const ctx = this.tenantContext.get();
    if (ctx?.orgId && ctx.userId === userId) return ctx.orgId;

    if (!userId || userId === 'dev-user') return undefined;

    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < OrgResolverService.TTL_MS) return hit.orgId;

    try {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      const orgId = user?.orgId;
      this.cache.set(userId, { orgId, at: Date.now() });
      return orgId;
    } catch (err: any) {
      this.logger.warn(`orgIdForUser(${userId}) lookup failed: ${err.message}`);
      return undefined;
    }
  }
}
