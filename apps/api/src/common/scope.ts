import { ForbiddenException } from '@nestjs/common';
import type { AuthPrincipal } from '@crm/shared';

/**
 * Throw if the principal's branch scope does not include `branchId`.
 * An empty `branchIds` means the principal has access to all branches.
 */
export function assertBranchScope(user: AuthPrincipal, branchId: string): void {
  if (user.branchIds.length > 0 && !user.branchIds.includes(branchId)) {
    throw new ForbiddenException({
      code: 'TENANT_SCOPE_VIOLATION',
      message: 'אין גישה לסניף זה',
    });
  }
}

/** Prisma `where` fragment restricting rows to the principal's branch scope. */
export function branchScopeFilter(user: AuthPrincipal): { branchId?: { in: string[] } } {
  return user.branchIds.length > 0 ? { branchId: { in: user.branchIds } } : {};
}
