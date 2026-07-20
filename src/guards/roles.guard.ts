import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../users/user.entity';

export const ROLES_KEY = 'atom_roles';

/**
 * @Roles('owner', 'admin') — restrict an endpoint to the given org roles.
 * Must be used together with RolesGuard (controller-level @UseGuards).
 * ApiKeyGuard runs first (global) and sets req.atomRole:
 *   jwt    → role from the token
 *   apikey → 'owner' (service/admin credential)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Record<string, any>>();
    const role: UserRole | undefined = req?.atomRole;

    if (!role || !required.includes(role)) {
      throw new ForbiddenException(
        `This action requires one of the following roles: ${required.join(', ')}.`,
      );
    }
    return true;
  }
}
