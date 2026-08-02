import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * UserThrottlerGuard — per-user rate limiting.
 *
 * WHAT WAS WRONG
 *   The stock ThrottlerGuard buckets by `req.ip`. Express only derives a real
 *   client IP from X-Forwarded-For when `trust proxy` is set, and it was not —
 *   so behind Railway's edge every single request resolved to the same proxy
 *   address. The 120/min limit was therefore not per-user and not even per-IP:
 *   it was ONE bucket for the entire user base. One person's runaway loop
 *   starved everybody.
 *
 * WHAT THIS DOES
 *   Buckets on the authenticated user id when there is one, falling back to IP
 *   for anonymous traffic (login, register, health).
 *
 * WHY THE USER ID IS AVAILABLE HERE
 *   APP_GUARDs run in registration order and ApiKeyGuard is registered before
 *   this one in app.module.ts, so `req.atomUserId` is already populated by the
 *   time this runs. That ordering is load-bearing — do not reorder the guards.
 *
 *   Routes marked @Public() (auth/login, auth/register) short-circuit
 *   ApiKeyGuard before it sets atomUserId, so they fall through to the IP
 *   bucket. That is the correct behaviour: those are exactly the endpoints
 *   where per-IP brute-force limiting is what you want, and they already carry
 *   their own stricter @Throttle() decorators.
 *
 * SPOOFING NOTE
 *   An IP bucket derived from X-Forwarded-For is only as trustworthy as the
 *   proxy chain in front of it — see the `trust proxy` comment in main.ts. The
 *   authenticated bucket has no such weakness: `atomUserId` comes from a
 *   signature-verified JWT and cannot be forged by the client.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = req?.atomUserId;

    // 'dev-user' is the shared placeholder used when no credentials are
    // configured in development. Bucketing on it would recreate exactly the
    // single-shared-bucket bug this guard exists to fix, so treat it as
    // anonymous and fall through to IP.
    if (userId && userId !== 'dev-user') {
      return `user:${userId}`;
    }

    // API-key callers all resolve to OWNER_USER_ID, so they legitimately share
    // one bucket — that is a single service credential, not a set of users.

    const ip =
      req?.ip ??
      req?.socket?.remoteAddress ??
      'unknown';

    return `ip:${ip}`;
  }
}
