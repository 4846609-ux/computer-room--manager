import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ComputerStatus, Prisma, SessionStatus } from '@crm/database';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { branchScopeFilter } from '../common/scope';

@Injectable()
class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async metrics(user: AuthPrincipal) {
    const scope = branchScopeFilter(user);
    const computerWhere: Prisma.ComputerWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null,
      ...scope,
    };

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

    const [byStatus, activeSessions, endedToday, endedMonth, printsToday, debts] =
      await Promise.all([
        this.prisma.computer.groupBy({
          by: ['status'],
          where: computerWhere,
          _count: { _all: true },
        }),
        this.prisma.usageSession.count({
          where: {
            tenantId: user.tenantId,
            ...scope,
            status: { in: [SessionStatus.ACTIVE, SessionStatus.PAUSED] },
          },
        }),
        this.prisma.usageSession.aggregate({
          where: {
            tenantId: user.tenantId,
            ...scope,
            status: SessionStatus.ENDED,
            endedAt: { gte: startOfDay },
          },
          _sum: { amountMinor: true, secondsBilled: true },
        }),
        this.prisma.usageSession.aggregate({
          where: {
            tenantId: user.tenantId,
            ...scope,
            status: SessionStatus.ENDED,
            endedAt: { gte: startOfMonth },
          },
          _sum: { amountMinor: true },
        }),
        this.prisma.printJob.count({
          where: { tenantId: user.tenantId, ...scope, createdAt: { gte: startOfDay } },
        }),
        this.prisma.customerBalance.aggregate({
          where: { tenantId: user.tenantId },
          _sum: { debtMinor: true },
        }),
      ]);

    const statusCounts: Record<string, number> = {};
    for (const row of byStatus) statusCounts[row.status] = row._count._all;
    const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);

    return {
      computers: {
        total,
        available: statusCounts[ComputerStatus.AVAILABLE] ?? 0,
        inUse: statusCounts[ComputerStatus.IN_USE] ?? 0,
        disconnected: statusCounts[ComputerStatus.DISCONNECTED] ?? 0,
        fault: statusCounts[ComputerStatus.FAULT] ?? 0,
        maintenance: statusCounts[ComputerStatus.MAINTENANCE] ?? 0,
        reserved: statusCounts[ComputerStatus.RESERVED] ?? 0,
      },
      activeSessions,
      connectedCustomers: activeSessions,
      revenueTodayMinor: endedToday._sum.amountMinor ?? 0,
      revenueMonthMinor: endedMonth._sum.amountMinor ?? 0,
      usageSecondsToday: endedToday._sum.secondsBilled ?? 0,
      printsToday,
      openDebtsMinor: debts._sum.debtMinor ?? 0,
    };
  }
}

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('metrics')
  @RequirePermissions(PERMISSIONS.SESSION_READ)
  @ApiOperation({ summary: 'מדדי לוח בקרה חיים' })
  metrics(@CurrentUser() user: AuthPrincipal) {
    return this.dashboard.metrics(user);
  }
}

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
