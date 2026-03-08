import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Global API-key guard.
 *
 * - If API_KEY env var is not set  → guard is disabled (dev / no-auth mode).
 * - If API_KEY is set              → every non-@Public() request must supply
 *                                    `Authorization: Bearer <key>`.
 * - After auth passes, req.atomUserId is set from OWNER_USER_ID env var
 *   (defaults to "default-user").  Controllers must read req.atomUserId
 *   instead of trusting any client-supplied userId.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
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

    if (apiKey) {
      const auth: string = req.headers?.['authorization'] ?? '';
      const [scheme, token] = auth.split(' ');
      if (scheme !== 'Bearer' || token !== apiKey) {
        throw new UnauthorizedException('Invalid or missing API key');
      }
    }

    // Attach the server-side owner identity — never trust client-supplied userId
    req.atomUserId = this.config.get<string>('OWNER_USER_ID') ?? 'default-user';
    return true;
  }
}
