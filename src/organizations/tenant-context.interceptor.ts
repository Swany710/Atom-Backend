import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable } from 'rxjs';
import { TenantContextService, TenantContext } from './tenant-context.service';
import { User } from '../users/user.entity';

/**
 * TenantContextInterceptor — global. Bridges ApiKeyGuard's request fields
 * (atomUserId / atomOrgId / atomRole / authMode) into AsyncLocalStorage so
 * services can read tenant context without touching the request object.
 *
 * API-key mode has no org claim (there is no JWT), so the owner user's orgId
 * is looked up once from the DB and cached in-memory.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantContextInterceptor.name);
  /** userId → orgId cache for API-key mode (owner rarely changes org) */
  private readonly orgCache = new Map<string, { orgId?: string; at: number }>();
  private static readonly CACHE_TTL_MS = 5 * 60_000;

  constructor(
    private readonly tenantContext: TenantContextService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest<Record<string, any>>();

    const userId: string | undefined = req?.atomUserId;
    if (!userId) {
      // Public route (or guard skipped) — run without tenant context
      return next.handle();
    }

    let orgId: string | undefined = req.atomOrgId;

    // API-key mode: resolve the owner user's org from DB (cached)
    if (!orgId && req.authMode === 'apikey' && userId !== 'dev-user') {
      const cached = this.orgCache.get(userId);
      if (cached && Date.now() - cached.at < TenantContextInterceptor.CACHE_TTL_MS) {
        orgId = cached.orgId;
      } else {
        try {
          const user = await this.userRepo.findOne({ where: { id: userId } });
          orgId = user?.orgId;
          this.orgCache.set(userId, { orgId, at: Date.now() });
        } catch (err: any) {
          this.logger.warn(`org lookup failed for apikey user ${userId}: ${err.message}`);
        }
      }
    }

    const ctx: TenantContext = {
      userId,
      orgId,
      role: req.atomRole ?? 'member',
      authMode: req.authMode ?? 'open',
    };
    // expose resolved org back onto the request for code that reads req directly
    req.atomOrgId = orgId;

    return this.tenantContext.run(ctx, () => next.handle());
  }
}
