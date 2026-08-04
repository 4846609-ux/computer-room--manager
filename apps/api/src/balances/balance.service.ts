import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, BalanceUnit, LedgerKind } from '@crm/database';
import { PrismaService } from '../prisma/prisma.service';

export interface LedgerDelta {
  tenantId: string;
  customerId: string;
  unit: BalanceUnit;
  amount: number; // signed: positive credits, negative consumes
  kind: LedgerKind;
  reason?: string;
  referenceType?: string;
  referenceId?: string;
  createdById?: string;
  /** allow the resulting balance to go negative (e.g. debt within credit limit) */
  allowNegative?: boolean;
}

const UNIT_FIELD: Record<BalanceUnit, keyof Prisma.CustomerBalanceUpdateInput> = {
  MONEY: 'moneyMinor',
  TIME_SECONDS: 'timeSecondsRemaining',
  PRINT_BW: 'printBwRemaining',
  PRINT_COLOR: 'printColorRemaining',
};

/**
 * The single gateway for changing customer balances. Every change is applied
 * inside a DB transaction together with an append-only ledger row — a balance is
 * NEVER mutated without a matching CustomerBalanceTransaction. See
 * docs/database-design.md §3.
 */
@Injectable()
export class BalanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Apply a signed delta to one balance unit and write the ledger entry, all
   * inside the provided transaction client. Returns the new balance for that unit.
   */
  async applyWithin(tx: Prisma.TransactionClient, delta: LedgerDelta): Promise<number> {
    const balance = await tx.customerBalance.upsert({
      where: { customerId: delta.customerId },
      create: { tenantId: delta.tenantId, customerId: delta.customerId },
      update: {},
    });

    const current = this.readUnit(balance, delta.unit);
    const next = current + delta.amount;

    if (next < 0 && !delta.allowNegative) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_BALANCE',
        message: 'יתרה לא מספקת לביצוע הפעולה',
        details: { unit: delta.unit, current, requested: delta.amount },
      });
    }

    const field = UNIT_FIELD[delta.unit];
    await tx.customerBalance.update({
      where: { customerId: delta.customerId },
      data: { [field]: next } as Prisma.CustomerBalanceUpdateInput,
    });

    await tx.customerBalanceTransaction.create({
      data: {
        tenantId: delta.tenantId,
        customerId: delta.customerId,
        kind: delta.kind,
        unit: delta.unit,
        amount: delta.amount,
        balanceAfter: next,
        reason: delta.reason,
        referenceType: delta.referenceType,
        referenceId: delta.referenceId,
        createdById: delta.createdById,
      },
    });

    return next;
  }

  /** Convenience wrapper that opens its own transaction for a single delta. */
  async apply(delta: LedgerDelta): Promise<number> {
    return this.prisma.$transaction((tx) => this.applyWithin(tx, delta));
  }

  private readUnit(
    balance: {
      moneyMinor: number;
      timeSecondsRemaining: number;
      printBwRemaining: number;
      printColorRemaining: number;
    },
    unit: BalanceUnit,
  ): number {
    switch (unit) {
      case 'MONEY':
        return balance.moneyMinor;
      case 'TIME_SECONDS':
        return balance.timeSecondsRemaining;
      case 'PRINT_BW':
        return balance.printBwRemaining;
      case 'PRINT_COLOR':
        return balance.printColorRemaining;
    }
  }
}
