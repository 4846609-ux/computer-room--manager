import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  tenantId: string;
  actorId?: string;
  actorType?: 'EMPLOYEE' | 'CUSTOMER' | 'AGENT' | 'SYSTEM';
  branchId?: string | null;
  action: string;
  entity: string;
  entityId?: string;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
  ip?: string;
  device?: string;
  success?: boolean;
}

/** Writes append-only audit records. There is no update/delete path by design. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorId: entry.actorId,
        actorType: entry.actorType ?? 'EMPLOYEE',
        branchId: entry.branchId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        previousValue: entry.previousValue as object | undefined,
        newValue: entry.newValue as object | undefined,
        reason: entry.reason,
        ip: entry.ip,
        device: entry.device,
        success: entry.success ?? true,
      },
    });
  }
}
