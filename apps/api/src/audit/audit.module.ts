import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@crm/database';
import { PERMISSIONS, paginationQuerySchema, type AuthPrincipal, type PaginationQuery } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';

@Injectable()
class AuditReadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthPrincipal, query: PaginationQuery, filters: { entity?: string; action?: string }) {
    const where: Prisma.AuditLogWhereInput = {
      tenantId: user.tenantId,
      ...(user.branchIds.length > 0 ? { branchId: { in: user.branchIds } } : {}),
      ...(filters.entity ? { entity: filters.entity } : {}),
      ...(filters.action ? { action: filters.action } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }
}

// Read-only: the audit log has no update/delete path by design.
@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
class AuditController {
  constructor(private readonly service: AuditReadService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'יומן פעילות (קריאה בלבד)' })
  list(@CurrentUser() user: AuthPrincipal, @Query() query: Record<string, string>) {
    return this.service.list(user, paginationQuerySchema.parse(query), {
      entity: query.entity,
      action: query.action,
    });
  }
}

@Module({
  controllers: [AuditController],
  providers: [AuditReadService],
})
export class AuditReadModule {}
