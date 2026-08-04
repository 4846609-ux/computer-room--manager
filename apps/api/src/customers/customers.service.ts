import { Injectable, NotFoundException } from '@nestjs/common';
import { LedgerKind } from '@crm/database';
import type { AuthPrincipal, PaginatedResult, PaginationQuery } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { BalanceService } from '../balances/balance.service';
import {
  BlockCustomerDto,
  CreateCustomerDto,
  LoadBalanceDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly balances: BalanceService,
  ) {}

  async list(user: AuthPrincipal, query: PaginationQuery): Promise<PaginatedResult<unknown>> {
    const where = {
      tenantId: user.tenantId,
      deletedAt: null,
      ...(query.q
        ? {
            OR: [
              { fullName: { contains: query.q, mode: 'insensitive' as const } },
              { phone: { contains: query.q } },
              { email: { contains: query.q, mode: 'insensitive' as const } },
              { barcode: { equals: query.q } },
              { rfid: { equals: query.q } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: { balance: true, group: { select: { id: true, name: true } } },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async get(user: AuthPrincipal, id: string): Promise<unknown> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
      include: { balance: true, group: true },
    });
    if (!customer) throw new NotFoundException({ code: 'NOT_FOUND', message: 'לקוח לא נמצא' });
    return customer;
  }

  /** Allocate the next tenant-scoped customer number from org settings, atomically. */
  private async nextCustomerNumber(tenantId: string): Promise<number> {
    const settings = await this.prisma.organizationSettings.update({
      where: { tenantId },
      data: { customerNumberSeq: { increment: 1 } },
      select: { customerNumberSeq: true },
    });
    return settings.customerNumberSeq;
  }

  async create(user: AuthPrincipal, dto: CreateCustomerDto): Promise<unknown> {
    const customerNumber = await this.nextCustomerNumber(user.tenantId);
    const customer = await this.prisma.customer.create({
      data: {
        tenantId: user.tenantId,
        customerNumber,
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email?.toLowerCase(),
        groupId: dto.groupId,
        primaryBranchId: dto.primaryBranchId,
        nationalId: dto.nationalId,
        internalNotes: dto.internalNotes,
        balance: { create: { tenantId: user.tenantId } },
      },
      include: { balance: true },
    });

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.employeeId,
      action: 'customer.create',
      entity: 'Customer',
      entityId: customer.id,
      newValue: { customerNumber, fullName: customer.fullName },
    });
    return customer;
  }

  async update(user: AuthPrincipal, id: string, dto: UpdateCustomerDto): Promise<unknown> {
    const before = await this.prisma.customer.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'לקוח לא נמצא' });

    const customer = await this.prisma.customer.update({
      where: { id },
      data: { ...dto, email: dto.email?.toLowerCase() },
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.employeeId,
      action: 'customer.update',
      entity: 'Customer',
      entityId: id,
      previousValue: { fullName: before.fullName, phone: before.phone, email: before.email },
      newValue: dto,
    });
    return customer;
  }

  async block(user: AuthPrincipal, id: string, dto: BlockCustomerDto): Promise<unknown> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!customer) throw new NotFoundException({ code: 'NOT_FOUND', message: 'לקוח לא נמצא' });

    const updated = await this.prisma.customer.update({
      where: { id },
      data: { status: 'BLOCKED', blockReason: dto.reason },
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.employeeId,
      action: 'customer.block',
      entity: 'Customer',
      entityId: id,
      reason: dto.reason,
    });
    return updated;
  }

  /** Load balance (money/time/print). Wrapped in a ledger transaction. */
  async loadBalance(user: AuthPrincipal, id: string, dto: LoadBalanceDto): Promise<unknown> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException({ code: 'NOT_FOUND', message: 'לקוח לא נמצא' });

    const kind = dto.unit === 'MONEY' ? LedgerKind.LOAD : LedgerKind.PACKAGE;
    const balanceAfter = await this.balances.apply({
      tenantId: user.tenantId,
      customerId: id,
      unit: dto.unit,
      amount: dto.amount,
      kind,
      reason: dto.reason ?? 'טעינה ידנית',
      referenceType: 'ManualLoad',
      createdById: user.employeeId,
    });

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.employeeId,
      action: 'balance.load',
      entity: 'CustomerBalance',
      entityId: id,
      newValue: { unit: dto.unit, amount: dto.amount, balanceAfter },
    });
    return { unit: dto.unit, balanceAfter };
  }

  async transactions(user: AuthPrincipal, id: string, query: PaginationQuery) {
    const where = { tenantId: user.tenantId, customerId: id };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.customerBalanceTransaction.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customerBalanceTransaction.count({ where }),
    ]);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }
}
