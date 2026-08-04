import { Body, Controller, Get, Header, Injectable, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { PERMISSIONS, formatMoney, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';

class ImportCustomersDto {
  @ApiProperty({ description: 'CSV: fullName,phone,email (שורת כותרת אופציונלית)' })
  @IsString() csv!: string;
}

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Import/export. Exports return CSV text; imports parse a simple CSV body. */
@Injectable()
class DataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async exportCustomers(user: AuthPrincipal): Promise<string> {
    const customers = await this.prisma.customer.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      orderBy: { customerNumber: 'asc' },
      include: { balance: true },
    });
    const header = 'customerNumber,fullName,phone,email,status,moneyMinor,timeSecondsRemaining';
    const rows = customers.map((c) =>
      [
        c.customerNumber,
        c.fullName,
        c.phone ?? '',
        c.email ?? '',
        c.status,
        c.balance?.moneyMinor ?? 0,
        c.balance?.timeSecondsRemaining ?? 0,
      ]
        .map(csvCell)
        .join(','),
    );
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'data.export', entity: 'Customer', newValue: { count: customers.length },
    });
    return [header, ...rows].join('\n');
  }

  async exportSales(user: AuthPrincipal): Promise<string> {
    const sales = await this.prisma.sale.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const header = 'id,createdAt,status,subtotal,tax,total';
    const rows = sales.map((s) =>
      [
        s.id,
        s.createdAt.toISOString(),
        s.status,
        formatMoney(s.subtotalMinor),
        formatMoney(s.taxMinor),
        formatMoney(s.totalMinor),
      ]
        .map(csvCell)
        .join(','),
    );
    return [header, ...rows].join('\n');
  }

  async importCustomers(user: AuthPrincipal, csv: string) {
    const lines = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return { imported: 0, errors: [] };

    // Skip a header row if present.
    const start = (lines[0] ?? '').toLowerCase().includes('fullname') ? 1 : 0;
    const errors: string[] = [];
    let imported = 0;

    for (let i = start; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const [fullName, phone, email] = line.split(',').map((s) => s.trim());
      if (!fullName) {
        errors.push(`שורה ${i + 1}: חסר שם`);
        continue;
      }
      try {
        const settings = await this.prisma.organizationSettings.update({
          where: { tenantId: user.tenantId },
          data: { customerNumberSeq: { increment: 1 } },
          select: { customerNumberSeq: true },
        });
        await this.prisma.customer.create({
          data: {
            tenantId: user.tenantId,
            customerNumber: settings.customerNumberSeq,
            fullName,
            phone: phone || undefined,
            email: email ? email.toLowerCase() : undefined,
            balance: { create: { tenantId: user.tenantId } },
          },
        });
        imported++;
      } catch {
        errors.push(`שורה ${i + 1}: יצירה נכשלה`);
      }
    }
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'data.import', entity: 'Customer', newValue: { imported, errors: errors.length },
    });
    return { imported, errors };
  }
}

@ApiTags('data')
@ApiBearerAuth()
@Controller()
class DataController {
  constructor(private readonly data: DataService) {}

  @Get('exports/customers.csv')
  @RequirePermissions(PERMISSIONS.DATA_EXPORT)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="customers.csv"')
  @ApiOperation({ summary: 'ייצוא לקוחות ל-CSV' })
  exportCustomers(@CurrentUser() user: AuthPrincipal) {
    return this.data.exportCustomers(user);
  }

  @Get('exports/sales.csv')
  @RequirePermissions(PERMISSIONS.DATA_EXPORT)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="sales.csv"')
  @ApiOperation({ summary: 'ייצוא עסקאות ל-CSV' })
  exportSales(@CurrentUser() user: AuthPrincipal) {
    return this.data.exportSales(user);
  }

  @Post('imports/customers')
  @RequirePermissions(PERMISSIONS.DATA_IMPORT)
  @ApiOperation({ summary: 'ייבוא לקוחות מ-CSV' })
  importCustomers(@CurrentUser() user: AuthPrincipal, @Body() dto: ImportCustomersDto) {
    return this.data.importCustomers(user, dto.csv);
  }
}

@Module({
  controllers: [DataController],
  providers: [DataService],
})
export class DataModule {}
