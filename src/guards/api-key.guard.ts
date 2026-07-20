import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Constant-time string comparison.
 * A naive `a !== b` short-circuits on the first mismatching character, which
 * leaks timing information an attacker can use to recover the API key
 * byte-by-byte. crypto.timingSafeEqual always compares every byte.
 * Hashing both sides first also hides length differences.
 */
function timingSafeEquals(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Unified authentication guard.
 *
 * Supports two authentication modes in a single pass:
 *
 * ① JWT Bearer token (per-user mode)
 *      Authorization: Bearer <signed-jwt>
 *      → verifies signature with JWT_SECRET
 *      → sets req.atomUserId = jwt.sub (user UUID from users table)
 *      → req.authMode = 'jwt'
 *
 * ② API-key Bearer token (service-to-service / legacy single-owner mode)
 *      Authorization: Bearer <api-key>
 *      → compared against API_KEY env var
 *      → sets req.atomUserId = OWNER_USER_ID
 *      → req.authMode = 'apikey'
 *
 * The guard tries JWT first (all JWTs contain '.'), then API-key.
 * This is fully backward-compatible — existing frontends using the API key
 * continue to work without any changes.
 *
 * In PRODUCTION:
 *   - At least one of API_KEY or JWT_SECRET must be configured.
 *   - Requests with no valid credential are always rejected.
 *
 * In DEVELOPMENT:
 *   - If API_KEY is unset and the token is not a valid JWT, auth is skipped.
 *   - req.atomUserId defaults to 'dev-user'.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly isProd = process.env.NODE_ENV === 'production';

  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Record<string, any>>();
    const authHeader: string = req.headers?.['authorization'] ?? '';
    const parts = authHeader.split(' ');
    const scheme = parts[0];
    const token  = parts[1] ?? '';

    if (scheme === 'Bearer' && token) {
      // ── Try JWT first (contains dots) ────────────────────────────────
      if (token.includes('.')) {
        const jwtSecret = this.config.get<string>('JWT_SECRET');
        if (jwtSecret) {
          try {
            const payload = this.jwtService.verify<{
              sub: string;
              email: string;
              org?: string;
              role?: string;
            }>(token, { secret: jwtSecret });

            // Tenancy: tokens minted before the org layer carry no `org`
            // claim. Reject them so the user logs in again and gets a
            // properly-scoped token (TENANCY-DESIGN §3).
            if (!payload.org) {
              throw new UnauthorizedException(
                'Session expired — please sign in again.',
              );
            }

            req.atomUserId = payload.sub;
            req.atomOrgId  = payload.org;
            req.atomRole   = payload.role ?? 'member';
            req.authMode   = 'jwt';
            return true;
          } catch (e) {
            if (e instanceof UnauthorizedException) throw e;
            // Fall through to API-key check — maybe it just happened to contain '.'
          }
        }
      }

      // ── API-key check ─────────────────────────────────────────────────
      const apiKey = this.config.get<string>('API_KEY');
      if (apiKey) {
        if (!timingSafeEquals(token, apiKey)) {
          // A three-part token is a JWT that failed verification above —
          // almost always an EXPIRED login session, not an API-key problem.
          // Say so, instead of the misleading "Invalid API key".
          if (token.split('.').length === 3) {
            throw new UnauthorizedException('Session expired — please sign in again.');
          }
          throw new UnauthorizedException('Invalid or missing API key');
        }
        const ownerId = this.config.get<string>('OWNER_USER_ID');
        if (!ownerId) {
          if (this.isProd) {
            throw new InternalServerErrorException('Server misconfiguration: OWNER_USER_ID not set');
          }
          req.atomUserId = 'dev-user';
        } else {
          req.atomUserId = ownerId;
        }
        // API-key mode = service/admin credential → owner-level access.
        // atomOrgId is resolved lazily by TenantContextInterceptor (DB lookup
        // of the owner user's org) — guards must stay synchronous.
        req.atomRole = 'owner';
        req.authMode = 'apikey';
        return true;
      }

      // Token present but neither JWT secret nor API_KEY configured
      if (this.isProd) {
        throw new InternalServerErrorException(
          'Server misconfiguration: neither JWT_SECRET nor API_KEY is set',
        );
      }
    }

    // ── No credential at all ──────────────────────────────────────────────
    const apiKey = this.config.get<string>('API_KEY');
    if (this.isProd || apiKey) {
      throw new UnauthorizedException('Authorization header is required');
    }

    // Dev open mode — no credentials configured, skip auth
    req.atomUserId = 'dev-user';
    req.authMode   = 'open';
    return true;
  }
}
