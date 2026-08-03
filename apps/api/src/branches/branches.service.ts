import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthPrincipal, PaginatedResult, PaginationQuery } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

/**
 * Branch management. Every query is tenant-scoped from the principal, and read
 * access is additionally restricted to the principal's branch scope (empty = all).
 */
@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Throws if the principal's branch scope does not include the given branch. */
  private assertBranchScope(user: AuthPrincipal, branchId: string): void {
    if (user.branchIds.length > 0 && !user.branchIds.includes(branchId)) {
      throw new ForbiddenException({
        code: 'TENANT_SCOPE_VIOLATION',
        message: 'אין גישה לסניף זה',
      });
    }
  }

  async list(
    user: AuthPrincipal,
    query: PaginationQuery,
  ): Promise<PaginatedResult<unknown>> {
    const where = {
      tenantId: user.tenantId,
      deletedAt: null,
      ...(user.branchIds.length > 0 ? { id: { in: user.branchIds } } : {}),
      ...(query.q
        ? { OR: [{ name: { contains: query.q } }, { code: { contains: query.q } }] }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.branch.count({ where }),
    ]);

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async get(user: AuthPrincipal, id: string): Promise<unknown> {
    this.assertBranchScope(user, id);
    const branch = await this.prisma.branch.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!branch) throw new NotFoundException({ code: 'NOT_FOUND', message: 'סניף לא נמצא' });
    return branch;
  }

  async create(user: AuthPrincipal, dto: CreateBranchDto): Promise<unknown> {
    const existing = await this.prisma.branch.findFirst({
      where: { tenantId: user.tenantId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException({
        code: 'VALIDATION_FAILED',
        message: 'קוד סניף כבר קיים',
      });
    }

    const branch = await this.prisma.branch.create({
      data: { ...dto, tenantId: user.tenantId },
    });

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.employeeId,
      branchId: branch.id,
      action: 'branch.create',
      entity: 'Branch',
      entityId: branch.id,
      newValue: branch,
    });

    return branch;
  }

  async update(user: AuthPrincipal, id: string, dto: UpdateBranchDto): Promise<unknown> {
    this.assertBranchScope(user, id);
    const before = await this.prisma.branch.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'סניף לא נמצא' });

    const branch = await this.prisma.branch.update({ where: { id }, data: dto });

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.employeeId,
      branchId: id,
      action: 'branch.update',
      entity: 'Branch',
      entityId: id,
      previousValue: before,
      newValue: branch,
    });

    return branch;
  }

  async remove(user: AuthPrincipal, id: string): Promise<{ success: true }> {
    const before = await this.prisma.branch.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'סניף לא נמצא' });

    await this.prisma.branch.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.employeeId,
      branchId: id,
      action: 'branch.delete',
      entity: 'Branch',
      entityId: id,
      previousValue: before,
    });

    return { success: true };
  }
}
