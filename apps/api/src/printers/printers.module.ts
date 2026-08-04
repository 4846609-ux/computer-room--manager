import { Body, Controller, Get, Injectable, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { PrintColorMode, PrintSide } from '@crm/database';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { assertBranchScope, branchScopeFilter } from '../common/scope';

class CreatePrinterDto {
  @ApiProperty() @IsString() branchId!: string;
  @ApiProperty({ example: 'מדפסת ראשית' }) @IsString() @MinLength(1) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() supportsColor?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() supportsDuplex?: boolean;
}

class CreatePriceRuleDto {
  @ApiProperty({ enum: PrintColorMode }) @IsEnum(PrintColorMode) colorMode!: PrintColorMode;
  @ApiPropertyOptional({ default: 'A4' }) @IsOptional() @IsString() paperSize?: string;
  @ApiPropertyOptional({ enum: PrintSide }) @IsOptional() @IsEnum(PrintSide) side?: PrintSide;
  @ApiProperty({ example: 50, description: 'מחיר לעמוד (אגורות)' }) @IsInt() @Min(0) pricePerPageMinor!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() printerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() branchId?: string;
}

@Injectable()
class PrintersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listPrinters(user: AuthPrincipal) {
    return this.prisma.printer.findMany({
      where: { tenantId: user.tenantId, deletedAt: null, ...branchScopeFilter(user) },
      orderBy: { name: 'asc' },
    });
  }

  async createPrinter(user: AuthPrincipal, dto: CreatePrinterDto) {
    assertBranchScope(user, dto.branchId);
    const printer = await this.prisma.printer.create({ data: { ...dto, tenantId: user.tenantId } });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: dto.branchId,
      action: 'printer.create', entity: 'Printer', entityId: printer.id, newValue: { name: dto.name },
    });
    return printer;
  }

  listRules(user: AuthPrincipal) {
    return this.prisma.printPriceRule.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ colorMode: 'asc' }, { paperSize: 'asc' }],
    });
  }

  async createRule(user: AuthPrincipal, dto: CreatePriceRuleDto) {
    const rule = await this.prisma.printPriceRule.create({
      data: {
        tenantId: user.tenantId,
        colorMode: dto.colorMode,
        paperSize: dto.paperSize ?? 'A4',
        side: dto.side ?? PrintSide.SIMPLEX,
        pricePerPageMinor: dto.pricePerPageMinor,
        printerId: dto.printerId,
        branchId: dto.branchId,
      },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'print.pricing.create', entity: 'PrintPriceRule', entityId: rule.id,
      newValue: { colorMode: dto.colorMode, pricePerPageMinor: dto.pricePerPageMinor },
    });
    return rule;
  }
}

@ApiTags('printers')
@ApiBearerAuth()
@Controller()
class PrintersController {
  constructor(private readonly printers: PrintersService) {}

  @Get('printers')
  @RequirePermissions(PERMISSIONS.PRINT_READ)
  @ApiOperation({ summary: 'רשימת מדפסות' })
  list(@CurrentUser() user: AuthPrincipal) {
    return this.printers.listPrinters(user);
  }

  @Post('printers')
  @RequirePermissions(PERMISSIONS.PRINTER_MANAGE)
  @ApiOperation({ summary: 'הוספת מדפסת' })
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreatePrinterDto) {
    return this.printers.createPrinter(user, dto);
  }

  @Get('print-jobs/pricing')
  @RequirePermissions(PERMISSIONS.PRINT_READ)
  @ApiOperation({ summary: 'מחירוני הדפסה' })
  listRules(@CurrentUser() user: AuthPrincipal) {
    return this.printers.listRules(user);
  }

  @Post('print-jobs/pricing')
  @RequirePermissions(PERMISSIONS.PRINTER_MANAGE)
  @ApiOperation({ summary: 'הוספת כלל מחיר הדפסה' })
  createRule(@CurrentUser() user: AuthPrincipal, @Body() dto: CreatePriceRuleDto) {
    return this.printers.createRule(user, dto);
  }
}

@Module({
  controllers: [PrintersController],
  providers: [PrintersService],
})
export class PrintersModule {}
