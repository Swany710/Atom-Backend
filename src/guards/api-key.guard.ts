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
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Route decorated with @Public() always passes through
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const apiKey = this.config.get<string>('API_KEY');
    if (!apiKey) return true; // No key configured → open (development mode)

    const req = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const auth: string = req.headers['authorization'] ?? '';
    const [scheme, token] = auth.split(' ');

    if (scheme !== 'Bearer' || token !== apiKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }
    return true;
  }
}
