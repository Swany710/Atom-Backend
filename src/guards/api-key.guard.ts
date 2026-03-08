import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Global API-key guard.
 *
 * In PRODUCTION (NODE_ENV=production):
 *   - API_KEY must be set — requests without a valid Bearer token are rejected.
 *   - OWNER_USER_ID must be set — requests fail if identity cannot be resolved.
 *   - There is NO open/bypass fallback mode.
 *
 * In DEVELOPMENT:
 *   - If API_KEY is unset, auth is skipped (open mode for local iteration).
 *   - OWNER_USER_ID defaults to 'dev-user' if unset.
 *
 * After auth passes, req.atomUserId is always set from OWNER_USER_ID.
 * Controllers must read req.atomUserId — never trust any client-supplied userId.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly isProd = process.env.NODE_ENV === 'production';

  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const apiKey = this.config.get<string>('API_KEY');
    const req = context.switchToHttp().getRequest<Record<string, any>>();

    if (this.isProd && !apiKey) {
      // validateProductionEnv catches this at startup, but defend in depth
      throw new InternalServerErrorException('Server misconfiguration: API_KEY not set');
    }

    if (apiKey) {
      const auth: string = req.headers?.['authorization'] ?? '';
      const parts = auth.split(' ');
      const scheme = parts[0];
      const token = parts[1];
      if (scheme !== 'Bearer' || !token || token !== apiKey) {
        throw new UnauthorizedException('Invalid or missing API key');
      }
    }
    // !apiKey && !isProd → dev open mode, fall through

    // Resolve server-side identity — never trust client-supplied userId
    const ownerId = this.config.get<string>('OWNER_USER_ID');
    if (!ownerId) {
      if (this.isProd) {
        throw new InternalServerErrorException('Server misconfiguration: OWNER_USER_ID not set');
      }
      req.atomUserId = 'dev-user';
    } else {
      req.atomUserId = ownerId;
    }

    return true;
  }
}
