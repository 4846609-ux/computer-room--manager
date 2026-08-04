import { BadRequestException } from '@nestjs/common';
import { BalanceService } from './balance.service';

/**
 * A minimal in-memory fake of Prisma.TransactionClient covering the two tables
 * BalanceService touches. It lets us assert the core invariant — no balance change
 * without a matching ledger row — without a live database.
 */
function makeFakeTx(initial: Partial<Record<string, number>> = {}) {
  const balance = {
    tenantId: 't1',
    customerId: 'c1',
    moneyMinor: initial.moneyMinor ?? 0,
    timeSecondsRemaining: initial.timeSecondsRemaining ?? 0,
    printBwRemaining: initial.printBwRemaining ?? 0,
    printColorRemaining: initial.printColorRemaining ?? 0,
    debtMinor: 0,
  };
  const ledger: Array<Record<string, unknown>> = [];
  const tx = {
    customerBalance: {
      upsert: async () => balance,
      update: async ({ data }: { data: Record<string, number> }) => {
        Object.assign(balance, data);
        return balance;
      },
    },
    customerBalanceTransaction: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        ledger.push(data);
        return data;
      },
    },
  };
  return { tx, balance, ledger };
}

describe('BalanceService — ledger invariant', () => {
  const service = new BalanceService({} as never);

  it('credits money and writes a ledger row with the resulting balance', async () => {
    const { tx, balance, ledger } = makeFakeTx({ moneyMinor: 1000 });
    const after = await service.applyWithin(tx as never, {
      tenantId: 't1',
      customerId: 'c1',
      unit: 'MONEY',
      amount: 5000,
      kind: 'LOAD',
    });
    expect(after).toBe(6000);
    expect(balance.moneyMinor).toBe(6000);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ unit: 'MONEY', amount: 5000, balanceAfter: 6000 });
  });

  it('consumes time and records a negative signed amount', async () => {
    const { tx, balance, ledger } = makeFakeTx({ timeSecondsRemaining: 6000 });
    const after = await service.applyWithin(tx as never, {
      tenantId: 't1',
      customerId: 'c1',
      unit: 'TIME_SECONDS',
      amount: -1800,
      kind: 'USAGE',
    });
    expect(after).toBe(4200);
    expect(balance.timeSecondsRemaining).toBe(4200);
    expect(ledger[0]).toMatchObject({ amount: -1800, balanceAfter: 4200 });
  });

  it('rejects an overdraft (insufficient balance) and writes no ledger row', async () => {
    const { tx, ledger } = makeFakeTx({ moneyMinor: 500 });
    await expect(
      service.applyWithin(tx as never, {
        tenantId: 't1',
        customerId: 'c1',
        unit: 'MONEY',
        amount: -1000,
        kind: 'USAGE',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ledger).toHaveLength(0);
  });

  it('allows a negative balance when explicitly permitted (credit line)', async () => {
    const { tx, balance } = makeFakeTx({ moneyMinor: 0 });
    const after = await service.applyWithin(tx as never, {
      tenantId: 't1',
      customerId: 'c1',
      unit: 'MONEY',
      amount: -300,
      kind: 'USAGE',
      allowNegative: true,
    });
    expect(after).toBe(-300);
    expect(balance.moneyMinor).toBe(-300);
  });
});
