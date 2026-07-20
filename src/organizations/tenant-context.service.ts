import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { UserRole } from '../users/user.entity';

export interface TenantContext {
  userId: string;
  orgId?: string;
  role: UserRole;
  authMode: 'jwt' | 'apikey' | 'open';
}

/**
 * TenantContextService — per-request tenant context via AsyncLocalStorage.
 *
 * Populated by TenantContextInterceptor (global) from what ApiKeyGuard put on
 * the request. Services call `tenantContext.get()` (or `.orgIdOrFail()`)
 * instead of threading orgId through every method signature.
 *
 * TENANCY-DESIGN §3: every repository query in every service must add the
 * org predicate — no query ships without it.
 */
@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantContext>();

  /** Run fn with the given context (used by the interceptor). */
  run<T>(ctx: TenantContext, fn: () => T): T {
    return this.als.run(ctx, fn);
  }

  /** Current context, or undefined outside a request (e.g. cron jobs). */
  get(): TenantContext | undefined {
    return this.als.getStore();
  }

  /** Current orgId or throw — for services where scoping is mandatory. */
  orgIdOrFail(): string {
    const ctx = this.als.getStore();
    if (!ctx?.orgId) {
      throw new Error(
        'TenantContext missing orgId — endpoint reached without tenant scoping. ' +
          'This is a bug: check TenantContextInterceptor registration.',
      );
    }
    return ctx.orgId;
  }

  /** Convenience accessors */
  userId(): string | undefined {
    return this.als.getStore()?.userId;
  }

  role(): UserRole | undefined {
    return this.als.getStore()?.role;
  }
}
