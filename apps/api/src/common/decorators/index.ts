import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthPrincipal, PermissionKey } from '@crm/shared';

/** Marks a route as public (skips JwtAuthGuard). */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Declares the permissions required to access a route (checked server-side). */
export const PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (
  ...permissions: PermissionKey[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_KEY, permissions);

/** Injects the authenticated principal (set by JwtStrategy) into a handler param. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthPrincipal;
  },
);
