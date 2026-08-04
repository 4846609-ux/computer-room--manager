import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Prisma, SessionStatus } from '@crm/database';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { branchScopeFilter } from '../common/scope';

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'year';

/** Resolve a preset or explicit from/to into a date range. */
function resolveRange(preset?: string, from?: string, to?: string): { from: Date; to: Date } {
  if (from && to) return { from: new Date(from), to: new Date(to) };
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset as Preset) {
    case 'yesterday': {
      const y = new Date(start);
      y.setDate(y.getDate() - 1);
      return { from: y, to: start };
    }
    case 'week': {
      const w = new Date(start);
      w.setDate(w.getDate() - 7);
      return { from: w, to: now };
    }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3) * 3;
      return { from: new Date(now.getFullYear(), q, 1), to: now };
    }
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1), to: now };
    case 'today':
    default:
      return { from: start, to: now };
  }
}

@Injectable()
class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async revenue(user: AuthPrincipal, range: { from: Date; to: Date }) {
    const scope = branchScopeFilter(user);
    const [usage, payments, refunds] = await Promise.all([
      this.prisma.usageSession.aggregate({
        where: {
          tenantId: user.tenantId,
          ...scope,
          status: SessionStatus.ENDED,
          endedAt: { gte: range.from, lte: range.to },
        },
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ['method'],
        where: {
          tenantId: user.tenantId,
          status: 'COMPLETED',
          createdAt: { gte: range.from, lte: range.to },
        },
        _sum: { amountMinor: true },
      }),
      this.prisma.refund.aggregate({
        where: { tenantId: user.tenantId, createdAt: { gte: range.from, lte: range.to } },
        _sum: { amountMinor: true },
      }),
    ]);

    const byMethod = payments.map((p) => ({ method: p.method, totalMinor: p._sum.amountMinor ?? 0 }));
    const salesTotal = byMethod.reduce((s, m) => s + m.totalMinor, 0);

    return {
      range,
      usageRevenueMinor: usage._sum.amountMinor ?? 0,
      sessionsEnded: usage._count._all,
      salesRevenueMinor: salesTotal,
      refundsMinor: refunds._sum.amountMinor ?? 0,
      netRevenueMinor: salesTotal - (refunds._sum.amountMinor ?? 0),
      paymentsByMethod: byMethod,
    };
  }

  async usage(user: AuthPrincipal, range: { from: Date; to: Date }) {
    const scope = branchScopeFilter(user);
    const where: Prisma.UsageSessionWhereInput = {
      tenantId: user.tenantId,
      ...scope,
      status: SessionStatus.ENDED,
      endedAt: { gte: range.from, lte: range.to },
    };
    const [agg, byComputer] = await Promise.all([
      this.prisma.usageSession.aggregate({
        where,
        _sum: { secondsBilled: true },
        _avg: { secondsBilled: true },
        _count: { _all: true },
      }),
      this.prisma.usageSession.groupBy({
        by: ['computerId'],
        where,
        _sum: { secondsBilled: true, amountMinor: true },
        orderBy: { _sum: { secondsBilled: 'desc' } },
        take: 10,
      }),
    ]);

    return {
      range,
      sessions: agg._count._all,
      totalSeconds: agg._sum.secondsBilled ?? 0,
      avgSeconds: Math.round(agg._avg.secondsBilled ?? 0),
      topComputers: byComputer.map((c) => ({
        computerId: c.computerId,
        seconds: c._sum.secondsBilled ?? 0,
        revenueMinor: c._sum.amountMinor ?? 0,
      })),
    };
  }
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('revenue')
  @RequirePermissions(PERMISSIONS.REPORT_REVENUE)
  @ApiQuery({ name: 'preset', required: false, example: 'month' })
  @ApiOperation({ summary: 'דוח הכנסות' })
  revenue(
    @CurrentUser() user: AuthPrincipal,
    @Query('preset') preset?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.revenue(user, resolveRange(preset, from, to));
  }

  @Get('usage')
  @RequirePermissions(PERMISSIONS.REPORT_USAGE)
  @ApiQuery({ name: 'preset', required: false, example: 'week' })
  @ApiOperation({ summary: 'דוח שימוש' })
  usage(
    @CurrentUser() user: AuthPrincipal,
    @Query('preset') preset?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.usage(user, resolveRange(preset, from, to));
  }
}

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
