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
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

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
            const payload = this.jwtService.verify<{ sub: string; email: string }>(
              token,
              { secret: jwtSecret },
            );
            req.atomUserId = payload.sub;
            req.authMode   = 'jwt';
            return true;
          } catch {
            // Fall through to API-key check — maybe it just happened to contain '.'
          }
        }
      }

      // ── API-key check ─────────────────────────────────────────────────
      const apiKey = this.config.get<string>('API_KEY');
      if (apiKey) {
        if (token !== apiKey) {
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
