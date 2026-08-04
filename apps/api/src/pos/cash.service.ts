import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CashMovementType, CashShiftStatus } from '@crm/database';
import type { AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CashMovementDto, CloseShiftDto, OpenShiftDto } from './dto/cash.dto';

/** Cash register shifts: open with a float, record movements, close with variance. */
@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async openShift(user: AuthPrincipal, dto: OpenShiftDto) {
    const register = await this.prisma.cashRegister.findFirst({
      where: { id: dto.registerId, tenantId: user.tenantId },
    });
    if (!register) throw new NotFoundException({ code: 'NOT_FOUND', message: 'קופה לא נמצאה' });

    const open = await this.prisma.cashShift.findFirst({
      where: { registerId: dto.registerId, status: CashShiftStatus.OPEN },
    });
    if (open) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'כבר קיימת משמרת פתוחה בקופה' });

    const shift = await this.prisma.cashShift.create({
      data: {
        tenantId: user.tenantId,
        registerId: dto.registerId,
        employeeId: user.employeeId,
        openingFloatMinor: dto.openingFloatMinor,
        movements: {
          create: {
            tenantId: user.tenantId,
            type: CashMovementType.OPENING_FLOAT,
            amountMinor: dto.openingFloatMinor,
            createdById: user.employeeId,
          },
        },
      },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: register.branchId,
      action: 'cash.shift.open', entity: 'CashShift', entityId: shift.id,
      newValue: { openingFloatMinor: dto.openingFloatMinor },
    });
    return shift;
  }

  async movement(user: AuthPrincipal, shiftId: string, dto: CashMovementDto) {
    const shift = await this.prisma.cashShift.findFirst({
      where: { id: shiftId, tenantId: user.tenantId, status: CashShiftStatus.OPEN },
    });
    if (!shift) throw new NotFoundException({ code: 'NOT_FOUND', message: 'משמרת פתוחה לא נמצאה' });

    const movement = await this.prisma.cashMovement.create({
      data: {
        tenantId: user.tenantId,
        shiftId,
        type: dto.type,
        amountMinor: dto.amountMinor,
        reason: dto.reason,
        createdById: user.employeeId,
      },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'cash.movement.create', entity: 'CashShift', entityId: shiftId,
      newValue: { type: dto.type, amountMinor: dto.amountMinor },
    });
    return movement;
  }

  /** Expected cash = float + cash sales + deposits − payouts − drops − refunds. */
  private async expectedCash(shiftId: string): Promise<number> {
    const [movements, cashSales] = await Promise.all([
      this.prisma.cashMovement.findMany({ where: { shiftId } }),
      this.prisma.sale.findMany({
        where: { cashShiftId: shiftId },
        include: { payments: true, refunds: true },
      }),
    ]);

    let total = 0;
    for (const m of movements) {
      switch (m.type) {
        case CashMovementType.OPENING_FLOAT:
        case CashMovementType.DEPOSIT:
          total += m.amountMinor;
          break;
        case CashMovementType.PAYOUT:
        case CashMovementType.DROP:
          total -= m.amountMinor;
          break;
        default:
          break;
      }
    }
    for (const sale of cashSales) {
      for (const p of sale.payments) {
        if (p.status === 'COMPLETED' && p.method === 'CASH') total += p.amountMinor;
      }
      for (const r of sale.refunds) total -= r.amountMinor;
    }
    return total;
  }

  async closeShift(user: AuthPrincipal, shiftId: string, dto: CloseShiftDto) {
    const shift = await this.prisma.cashShift.findFirst({
      where: { id: shiftId, tenantId: user.tenantId, status: CashShiftStatus.OPEN },
    });
    if (!shift) throw new NotFoundException({ code: 'NOT_FOUND', message: 'משמרת פתוחה לא נמצאה' });

    const expected = await this.expectedCash(shiftId);
    const variance = dto.countedMinor - expected;

    const closed = await this.prisma.cashShift.update({
      where: { id: shiftId },
      data: {
        status: CashShiftStatus.CLOSED,
        countedMinor: dto.countedMinor,
        expectedMinor: expected,
        varianceMinor: variance,
        closedAt: new Date(),
        notes: dto.notes,
        movements: {
          create: {
            tenantId: user.tenantId,
            type: CashMovementType.COUNT,
            amountMinor: dto.countedMinor,
            createdById: user.employeeId,
          },
        },
      },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'cash.shift.close', entity: 'CashShift', entityId: shiftId,
      newValue: { countedMinor: dto.countedMinor, expectedMinor: expected, varianceMinor: variance },
    });
    return { ...closed, expectedMinor: expected, varianceMinor: variance };
  }
}
