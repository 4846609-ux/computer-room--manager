import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { SubscriptionInterval, SubscriptionStatus } from '@crm/database';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { BalanceService } from '../balances/balance.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';

class CreateSubscriptionDto {
  @ApiProperty() @IsString() customerId!: string;
  @ApiProperty({ description: 'חבילה מסוג SUBSCRIPTION' }) @IsString() packageId!: string;
}

function advance(date: Date, interval: SubscriptionInterval): Date {
  const d = new Date(date);
  if (interval === 'WEEKLY') d.setDate(d.getDate() + 7);
  else if (interval === 'MONTHLY') d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d;
}

/**
 * Recurring subscriptions. `processDue` charges subscriptions whose period has
 * ended from the customer's money balance and advances the period; it is intended
 * to be invoked by a scheduled BullMQ worker (and can be triggered manually).
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly balances: BalanceService,
  ) {}

  list(user: AuthPrincipal) {
    return this.prisma.subscription.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { fullName: true } },
        package: { select: { name: true } },
      },
    });
  }

  async create(user: AuthPrincipal, dto: CreateSubscriptionDto) {
    const pkg = await this.prisma.package.findFirst({
      where: { id: dto.packageId, tenantId: user.tenantId, type: 'SUBSCRIPTION' },
      include: { prices: { where: { validTo: null }, orderBy: { validFrom: 'desc' }, take: 1 } },
    });
    if (!pkg) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'חבילת מנוי לא נמצאה' });

    const cfg = (pkg.config as Record<string, string>) ?? {};
    const interval = (cfg.interval as SubscriptionInterval) ?? SubscriptionInterval.MONTHLY;
    const priceMinor = pkg.prices[0]?.priceMinor ?? 0;

    const subscription = await this.prisma.subscription.create({
      data: {
        tenantId: user.tenantId,
        customerId: dto.customerId,
        packageId: pkg.id,
        interval,
        priceMinor,
        currentPeriodEnd: advance(new Date(), interval),
      },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'subscription.create', entity: 'Subscription', entityId: subscription.id,
      newValue: { packageId: pkg.id, interval, priceMinor },
    });
    return subscription;
  }

  /**
   * Record an externally-billed subscription (e.g. a Nedarim Plus standing order).
   * autoRenew is false so the internal worker never charges — the PSP bills monthly.
   */
  async createExternal(params: {
    tenantId: string;
    customerId: string;
    packageId: string;
    externalRef: string;
    priceMinor: number;
  }) {
    const pkg = await this.prisma.package.findFirst({
      where: { id: params.packageId, tenantId: params.tenantId },
    });
    const cfg = (pkg?.config as Record<string, string>) ?? {};
    const interval = (cfg.interval as SubscriptionInterval) ?? SubscriptionInterval.MONTHLY;
    return this.prisma.subscription.create({
      data: {
        tenantId: params.tenantId,
        customerId: params.customerId,
        packageId: params.packageId,
        interval,
        priceMinor: params.priceMinor,
        autoRenew: false,
        externalRef: params.externalRef,
        currentPeriodEnd: advance(new Date(), interval),
      },
    });
  }

  /** Charge all due subscriptions; mark PAST_DUE when the balance is insufficient.
   *  Callable by a controller (with the actor's ids) or a background worker. */
  async processDue(tenantId: string, actorId: string) {
    const due = await this.prisma.subscription.findMany({
      where: {
        tenantId,
        status: SubscriptionStatus.ACTIVE,
        autoRenew: true,
        currentPeriodEnd: { lte: new Date() },
      },
    });

    let charged = 0;
    let pastDue = 0;
    for (const sub of due) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.balances.applyWithin(tx, {
            tenantId,
            customerId: sub.customerId,
            unit: 'MONEY',
            amount: -sub.priceMinor,
            kind: 'USAGE',
            reason: 'חיוב מנוי מחזורי',
            referenceType: 'Subscription',
            referenceId: sub.id,
            createdById: actorId,
          });
          await tx.subscription.update({
            where: { id: sub.id },
            data: { currentPeriodEnd: advance(sub.currentPeriodEnd, sub.interval) },
          });
        });
        charged++;
      } catch {
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: SubscriptionStatus.PAST_DUE },
        });
        pastDue++;
      }
    }
    await this.audit.record({
      tenantId, actorId,
      action: 'subscription.process_due', entity: 'Subscription',
      newValue: { charged, pastDue, considered: due.length },
    });
    return { considered: due.length, charged, pastDue };
  }

  async cancel(user: AuthPrincipal, id: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!sub) throw new NotFoundException({ code: 'NOT_FOUND', message: 'מנוי לא נמצא' });
    return this.prisma.subscription.update({
      where: { id },
      data: { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date(), autoRenew: false },
    });
  }
}

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PACKAGE_READ)
  @ApiOperation({ summary: 'רשימת מנויים' })
  list(@CurrentUser() user: AuthPrincipal) {
    return this.subscriptions.list(user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SALE_CREATE)
  @ApiOperation({ summary: 'יצירת מנוי' })
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateSubscriptionDto) {
    return this.subscriptions.create(user, dto);
  }

  @Post('process-due')
  @RequirePermissions(PERMISSIONS.PACKAGE_MANAGE)
  @ApiOperation({ summary: 'הרצת חיוב מנויים שהגיע מועדם' })
  processDue(@CurrentUser() user: AuthPrincipal) {
    return this.subscriptions.processDue(user.tenantId, user.employeeId);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.SALE_CREATE)
  @ApiOperation({ summary: 'ביטול מנוי' })
  cancel(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.subscriptions.cancel(user, id);
  }
}

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
