import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SessionStatus } from '@crm/database';
import {
  computeSessionCharge,
  roundMinor,
  WS_EVENTS,
  type AuthPrincipal,
  type PaginationQuery,
  type RoundingRule,
} from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { BalanceService } from '../balances/balance.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { assertBranchScope, branchScopeFilter } from '../common/scope';
import { AddTimeDto, OpenSessionDto, TransferSessionDto } from './dto/session.dto';

interface GroupPricing {
  pricePerMinuteMinor: number;
  billingRatio: number;
  minChargeMinor: number;
  minMinutes: number;
  roundingRule: string;
}

const DEFAULT_PRICING: GroupPricing = {
  pricePerMinuteMinor: 0,
  billingRatio: 1,
  minChargeMinor: 0,
  minMinutes: 0,
  roundingRule: 'UP',
};

/**
 * Usage-session lifecycle and billing. Charges are accumulated per segment so a
 * session that moves between computers bills each segment at that computer's ratio
 * (spec scenario 2). All balance changes go through the ledger inside a
 * transaction; a customer can never hold two active sessions (spec scenario 9).
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly balances: BalanceService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private pricingFromGroup(group: GroupPricing | null): GroupPricing {
    return group ?? DEFAULT_PRICING;
  }

  /** Raw time charge for a segment (ratio applied, minimums deferred to close). */
  private segmentCharge(seconds: number, p: GroupPricing): number {
    const minutes = seconds / 60;
    return Math.round(minutes * p.pricePerMinuteMinor * p.billingRatio);
  }

  async list(user: AuthPrincipal, query: PaginationQuery, active?: boolean) {
    const where: Prisma.UsageSessionWhereInput = {
      tenantId: user.tenantId,
      ...branchScopeFilter(user),
      ...(active ? { status: { in: [SessionStatus.ACTIVE, SessionStatus.PAUSED] } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.usageSession.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { startedAt: 'desc' },
        include: {
          computer: { select: { id: true, name: true, stationNumber: true } },
          customer: { select: { id: true, fullName: true, customerNumber: true } },
        },
      }),
      this.prisma.usageSession.count({ where }),
    ]);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async open(user: AuthPrincipal, dto: OpenSessionDto) {
    const computer = await this.prisma.computer.findFirst({
      where: { id: dto.computerId, tenantId: user.tenantId, deletedAt: null },
      include: { group: true },
    });
    if (!computer) throw new NotFoundException({ code: 'NOT_FOUND', message: 'מחשב לא נמצא' });
    assertBranchScope(user, computer.branchId);

    // The computer must be free.
    const busy = await this.prisma.usageSession.findFirst({
      where: {
        computerId: computer.id,
        status: { in: [SessionStatus.ACTIVE, SessionStatus.PAUSED] },
      },
      select: { id: true },
    });
    if (busy) {
      throw new ConflictException({ code: 'SESSION_ALREADY_ACTIVE', message: 'העמדה תפוסה' });
    }

    // A customer may not hold two concurrent sessions (spec scenario 9).
    if (dto.customerId) {
      const existing = await this.prisma.usageSession.findFirst({
        where: {
          tenantId: user.tenantId,
          customerId: dto.customerId,
          status: { in: [SessionStatus.ACTIVE, SessionStatus.PAUSED] },
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException({
          code: 'SESSION_ALREADY_ACTIVE',
          message: 'ללקוח כבר קיים שימוש פעיל',
        });
      }
    }

    const pricing = this.pricingFromGroup(computer.group);
    const now = new Date();

    const session = await this.prisma.usageSession.create({
      data: {
        tenantId: user.tenantId,
        branchId: computer.branchId,
        computerId: computer.id,
        customerId: dto.customerId,
        billingSource: dto.billingSource,
        status: SessionStatus.ACTIVE,
        ratio: pricing.billingRatio,
        pricingSnapshot: pricing as unknown as Prisma.InputJsonValue,
        startedAt: now,
        billedThroughAt: now,
        plannedSeconds: dto.plannedSeconds,
        openedById: user.employeeId,
        events: { create: { tenantId: user.tenantId, type: 'STARTED', createdById: user.employeeId } },
      },
    });

    await this.prisma.computer.update({
      where: { id: computer.id },
      data: { status: 'IN_USE' },
    });

    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: computer.branchId,
      action: 'session.open', entity: 'UsageSession', entityId: session.id,
      newValue: { computerId: computer.id, customerId: dto.customerId, billingSource: dto.billingSource },
    });

    this.realtime.emitToBranch(WS_EVENTS.SESSION_STARTED, user.tenantId, computer.branchId, {
      sessionId: session.id,
      computerId: computer.id,
      customerId: dto.customerId,
    });
    this.realtime.emitToBranch(WS_EVENTS.COMPUTER_STATUS_CHANGED, user.tenantId, computer.branchId, {
      computerId: computer.id,
      status: 'IN_USE',
    });

    return session;
  }

  private async loadActive(user: AuthPrincipal, id: string) {
    const session = await this.prisma.usageSession.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { computer: { include: { group: true } } },
    });
    if (!session) throw new NotFoundException({ code: 'NOT_FOUND', message: 'שימוש לא נמצא' });
    assertBranchScope(user, session.branchId);
    if (session.status !== SessionStatus.ACTIVE && session.status !== SessionStatus.PAUSED) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'השימוש אינו פעיל' });
    }
    return session;
  }

  async addTime(user: AuthPrincipal, id: string, dto: AddTimeDto) {
    const session = await this.loadActive(user, id);
    const updated = await this.prisma.usageSession.update({
      where: { id },
      data: {
        plannedSeconds: (session.plannedSeconds ?? 0) + dto.seconds,
        events: {
          create: {
            tenantId: user.tenantId,
            type: 'ADD_TIME',
            data: { seconds: dto.seconds },
            createdById: user.employeeId,
          },
        },
      },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: session.branchId,
      action: 'session.add_time', entity: 'UsageSession', entityId: id, newValue: { seconds: dto.seconds },
    });
    this.realtime.emitToBranch(WS_EVENTS.SESSION_UPDATED, user.tenantId, session.branchId, {
      sessionId: id,
      addedSeconds: dto.seconds,
    });
    return updated;
  }

  /** Move an active session to another computer, billing the current segment first. */
  async transfer(user: AuthPrincipal, id: string, dto: TransferSessionDto) {
    const session = await this.loadActive(user, id);
    const target = await this.prisma.computer.findFirst({
      where: { id: dto.toComputerId, tenantId: user.tenantId, deletedAt: null },
      include: { group: true },
    });
    if (!target) throw new NotFoundException({ code: 'NOT_FOUND', message: 'מחשב יעד לא נמצא' });
    assertBranchScope(user, target.branchId);

    const targetBusy = await this.prisma.usageSession.findFirst({
      where: {
        computerId: target.id,
        status: { in: [SessionStatus.ACTIVE, SessionStatus.PAUSED] },
      },
      select: { id: true },
    });
    if (targetBusy) throw new ConflictException({ code: 'SESSION_ALREADY_ACTIVE', message: 'עמדת היעד תפוסה' });

    const now = new Date();
    const from = session.billedThroughAt ?? session.startedAt ?? now;
    const segSeconds = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
    const currentPricing = this.pricingFromGroup(session.computer.group);
    const segCharge = this.segmentCharge(segSeconds, currentPricing);
    const targetPricing = this.pricingFromGroup(target.group);

    const oldComputerId = session.computerId;
    const oldBranchId = session.branchId;

    const updated = await this.prisma.$transaction(async (tx) => {
      // free the old computer, occupy the new one
      await tx.computer.update({ where: { id: oldComputerId }, data: { status: 'AVAILABLE' } });
      await tx.computer.update({ where: { id: target.id }, data: { status: 'IN_USE' } });
      return tx.usageSession.update({
        where: { id },
        data: {
          computerId: target.id,
          branchId: target.branchId,
          ratio: targetPricing.billingRatio,
          pricingSnapshot: targetPricing as unknown as Prisma.InputJsonValue,
          secondsBilled: session.secondsBilled + segSeconds,
          amountMinor: session.amountMinor + segCharge,
          billedThroughAt: now,
          events: {
            create: {
              tenantId: user.tenantId,
              type: 'TRANSFER',
              data: { from: oldComputerId, to: target.id, segSeconds, segCharge },
              createdById: user.employeeId,
            },
          },
        },
      });
    });

    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: target.branchId,
      action: 'session.transfer', entity: 'UsageSession', entityId: id,
      newValue: { from: oldComputerId, to: target.id },
    });
    this.realtime.emitToBranch(WS_EVENTS.COMPUTER_STATUS_CHANGED, user.tenantId, oldBranchId, {
      computerId: oldComputerId,
      status: 'AVAILABLE',
    });
    this.realtime.emitToBranch(WS_EVENTS.COMPUTER_STATUS_CHANGED, user.tenantId, target.branchId, {
      computerId: target.id,
      status: 'IN_USE',
    });
    return updated;
  }

  /** End a session, finalize billing, deduct from the chosen source via the ledger. */
  async close(user: AuthPrincipal, id: string) {
    const session = await this.loadActive(user, id);
    const now = new Date();
    const from = session.billedThroughAt ?? session.startedAt ?? now;
    const segSeconds = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
    const pricing = this.pricingFromGroup(session.computer.group);

    const totalSeconds = session.secondsBilled + segSeconds;
    const rounding = pricing.roundingRule as RoundingRule;
    const hadTransfers = session.amountMinor > 0;

    let finalTotal: number;
    if (session.billingSource === 'FREE') {
      finalTotal = 0;
    } else if (hadTransfers) {
      // Multi-segment: segments were billed per-ratio; round the sum and apply the
      // minimum charge to the whole session.
      finalTotal = Math.max(roundMinor(session.amountMinor + this.segmentCharge(segSeconds, pricing), rounding), pricing.minChargeMinor);
    } else {
      // Single segment: the pricing engine applies min-minutes, min-charge and rounding.
      finalTotal = computeSessionCharge({
        seconds: totalSeconds,
        pricePerMinuteMinor: pricing.pricePerMinuteMinor,
        ratio: pricing.billingRatio,
        minChargeMinor: pricing.minChargeMinor,
        minMinutes: pricing.minMinutes,
        rounding,
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Deduct from the customer's balance where the source is prepaid.
      if (session.customerId && finalTotal > 0) {
        if (session.billingSource === 'MONEY_BALANCE') {
          await this.balances.applyWithin(tx, {
            tenantId: user.tenantId,
            customerId: session.customerId,
            unit: 'MONEY',
            amount: -finalTotal,
            kind: 'USAGE',
            reason: 'חיוב שימוש',
            referenceType: 'UsageSession',
            referenceId: id,
            createdById: user.employeeId,
          });
        } else if (session.billingSource === 'TIME_PACKAGE') {
          // Time depletes at the computer's billing ratio: on a ratio-2 station,
          // one real minute consumes two minutes of package time (spec scenario 1).
          const timeUnits = Math.round(totalSeconds * pricing.billingRatio);
          await this.balances.applyWithin(tx, {
            tenantId: user.tenantId,
            customerId: session.customerId,
            unit: 'TIME_SECONDS',
            amount: -timeUnits,
            kind: 'USAGE',
            reason: 'ניכוי זמן שימוש',
            referenceType: 'UsageSession',
            referenceId: id,
            createdById: user.employeeId,
          });
        }
        // PAY_PER_USE / SUBSCRIPTION are settled at POS / billing cycle.
      }

      await tx.computer.update({
        where: { id: session.computerId },
        data: { status: session.computer.group?.restartOnEnd ? 'MAINTENANCE' : 'AVAILABLE' },
      });

      return tx.usageSession.update({
        where: { id },
        data: {
          status: SessionStatus.ENDED,
          endedAt: now,
          billedThroughAt: now,
          secondsBilled: totalSeconds,
          amountMinor: finalTotal,
          events: {
            create: {
              tenantId: user.tenantId,
              type: 'ENDED',
              data: { totalSeconds, finalTotal },
              createdById: user.employeeId,
            },
          },
        },
      });
    });

    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: session.branchId,
      action: 'session.close', entity: 'UsageSession', entityId: id,
      newValue: { totalSeconds, amountMinor: finalTotal, billingSource: session.billingSource },
    });
    this.realtime.emitToBranch(WS_EVENTS.SESSION_ENDED, user.tenantId, session.branchId, {
      sessionId: id,
      amountMinor: finalTotal,
      totalSeconds,
    });
    this.realtime.emitToBranch(WS_EVENTS.COMPUTER_STATUS_CHANGED, user.tenantId, session.branchId, {
      computerId: session.computerId,
      status: 'AVAILABLE',
    });

    return result;
  }
}
