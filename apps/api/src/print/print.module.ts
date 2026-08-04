import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { PrintColorMode, PrintJobStatus, PrintSide, Prisma } from '@crm/database';
import { PERMISSIONS, WS_EVENTS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { BalanceService } from '../balances/balance.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RealtimeModule } from '../realtime/realtime.module';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { branchScopeFilter } from '../common/scope';

const DEFAULT_UNIT: Record<PrintColorMode, number> = { BW: 50, COLOR: 150 };

class CreatePrintJobDto {
  @ApiProperty({ example: 'branch-uuid' }) @IsString() branchId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() computerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() printerId?: string;
  @ApiPropertyOptional({ description: 'שם מסמך (ניתן להסתרה)' })
  @IsOptional() @IsString() documentName?: string;
  @ApiProperty({ example: 5 }) @IsInt() @Min(1) pages!: number;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) copies?: number;
  @ApiPropertyOptional({ enum: PrintColorMode }) @IsOptional() @IsEnum(PrintColorMode) colorMode?: PrintColorMode;
  @ApiPropertyOptional({ enum: PrintSide }) @IsOptional() @IsEnum(PrintSide) side?: PrintSide;
  @ApiPropertyOptional({ default: 'A4' }) @IsOptional() @IsString() paperSize?: string;
}

@Injectable()
class PrintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly balances: BalanceService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Resolve the per-page price from the most specific active rule, else a default. */
  private async unitPrice(
    tenantId: string,
    colorMode: PrintColorMode,
    paperSize: string,
    side: PrintSide,
  ): Promise<number> {
    const rule = await this.prisma.printPriceRule.findFirst({
      where: {
        tenantId,
        colorMode,
        paperSize,
        side,
        validFrom: { lte: new Date() },
        OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
      },
      orderBy: { validFrom: 'desc' },
    });
    return rule?.pricePerPageMinor ?? DEFAULT_UNIT[colorMode];
  }

  async list(user: AuthPrincipal) {
    return this.prisma.printJob.findMany({
      where: { tenantId: user.tenantId, ...branchScopeFilter(user) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { customer: { select: { fullName: true } }, computer: { select: { name: true } } },
    });
  }

  async create(user: AuthPrincipal, dto: CreatePrintJobDto) {
    const colorMode = dto.colorMode ?? PrintColorMode.BW;
    const side = dto.side ?? PrintSide.SIMPLEX;
    const paperSize = dto.paperSize ?? 'A4';
    const copies = dto.copies ?? 1;
    const unit = await this.unitPrice(user.tenantId, colorMode, paperSize, side);
    const totalMinor = unit * dto.pages * copies;

    const job = await this.prisma.printJob.create({
      data: {
        tenantId: user.tenantId,
        branchId: dto.branchId,
        customerId: dto.customerId,
        computerId: dto.computerId,
        printerId: dto.printerId,
        documentName: dto.documentName,
        pages: dto.pages,
        copies,
        colorMode,
        side,
        paperSize,
        unitPriceMinor: unit,
        totalMinor,
        pricingSnapshot: { unit, colorMode, paperSize, side } as Prisma.InputJsonValue,
        status: PrintJobStatus.PENDING_APPROVAL,
      },
    });
    this.realtime.emitToBranch(WS_EVENTS.PRINT_JOB_CREATED, user.tenantId, dto.branchId, {
      printJobId: job.id,
      pages: job.pages,
    });
    return job;
  }

  /** Approve & charge: draw from the print quota first, else the money balance. */
  async approve(user: AuthPrincipal, id: string) {
    const job = await this.prisma.printJob.findFirst({
      where: { id, tenantId: user.tenantId, status: PrintJobStatus.PENDING_APPROVAL },
    });
    if (!job) throw new NotFoundException({ code: 'NOT_FOUND', message: 'עבודת הדפסה לא נמצאה' });

    const totalPages = job.pages * job.copies;
    const quotaUnit = job.colorMode === 'COLOR' ? 'PRINT_COLOR' : 'PRINT_BW';

    await this.prisma.$transaction(async (tx) => {
      if (job.customerId) {
        const balance = await tx.customerBalance.findUnique({ where: { customerId: job.customerId } });
        const quota =
          job.colorMode === 'COLOR' ? balance?.printColorRemaining ?? 0 : balance?.printBwRemaining ?? 0;

        if (quota >= totalPages) {
          await this.balances.applyWithin(tx, {
            tenantId: user.tenantId,
            customerId: job.customerId,
            unit: quotaUnit,
            amount: -totalPages,
            kind: 'PRINT',
            reason: 'ניכוי מכסת הדפסות',
            referenceType: 'PrintJob',
            referenceId: id,
            createdById: user.employeeId,
          });
        } else {
          // Not enough print quota → charge money (guards against insufficient funds).
          await this.balances.applyWithin(tx, {
            tenantId: user.tenantId,
            customerId: job.customerId,
            unit: 'MONEY',
            amount: -job.totalMinor,
            kind: 'PRINT',
            reason: 'חיוב הדפסה',
            referenceType: 'PrintJob',
            referenceId: id,
            createdById: user.employeeId,
          });
        }
      }
      await tx.printJob.update({
        where: { id },
        data: { status: PrintJobStatus.COMPLETED, approvedById: user.employeeId },
      });
    });

    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: job.branchId,
      action: 'print.approve', entity: 'PrintJob', entityId: id,
      newValue: { pages: totalPages, totalMinor: job.totalMinor },
    });
    this.realtime.emitToBranch(WS_EVENTS.PRINT_JOB_COMPLETED, user.tenantId, job.branchId, { printJobId: id });
    return { ok: true };
  }

  async cancel(user: AuthPrincipal, id: string, reason?: string) {
    const job = await this.prisma.printJob.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!job) throw new NotFoundException({ code: 'NOT_FOUND', message: 'עבודת הדפסה לא נמצאה' });
    const updated = await this.prisma.printJob.update({
      where: { id },
      data: { status: PrintJobStatus.CANCELLED, cancelledReason: reason },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: job.branchId,
      action: 'print.cancel', entity: 'PrintJob', entityId: id, reason,
    });
    return updated;
  }
}

@ApiTags('print')
@ApiBearerAuth()
@Controller('print-jobs')
class PrintController {
  constructor(private readonly print: PrintService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRINT_READ)
  @ApiOperation({ summary: 'רשימת עבודות הדפסה' })
  list(@CurrentUser() user: AuthPrincipal) {
    return this.print.list(user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRINT_READ)
  @ApiOperation({ summary: 'יצירת עבודת הדפסה' })
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreatePrintJobDto) {
    return this.print.create(user, dto);
  }

  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.PRINT_APPROVE)
  @ApiOperation({ summary: 'אישור וחיוב הדפסה' })
  approve(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.print.approve(user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.PRINT_APPROVE)
  @ApiOperation({ summary: 'ביטול הדפסה' })
  cancel(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.print.cancel(user, id, body?.reason);
  }
}

@Module({
  imports: [RealtimeModule],
  controllers: [PrintController],
  providers: [PrintService],
})
export class PrintModule {}
