import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthPrincipal, PermissionKey } from '@crm/shared';
import { PERMISSIONS_KEY } from '../decorators';

/**
 * Enforces route-declared permissions against the principal's effective set.
 * Authorization is ALWAYS decided server-side — the client never bypasses this.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthPrincipal | undefined;
    if (!user) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'לא מורשה' });

    const granted = new Set(user.permissions);
    const missing = required.filter((p) => !granted.has(p));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'אין הרשאה לביצוע פעולה זו',
        details: { missing },
      });
    }
    return true;
  }
}
