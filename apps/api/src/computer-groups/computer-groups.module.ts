import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { PERMISSIONS, paginationQuerySchema, type AuthPrincipal, type PaginationQuery } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { assertBranchScope, branchScopeFilter } from '../common/scope';

class CreateComputerGroupDto {
  @ApiProperty({ example: 'מחשבים מתקדמים' })
  @IsString() @MinLength(1) name!: string;

  @ApiProperty({ example: 'branch-uuid' })
  @IsString() branchId!: string;

  @ApiPropertyOptional({ example: 1.0, description: 'יחס חיוב' })
  @IsOptional() @IsNumber() billingRatio?: number;

  @ApiPropertyOptional({ example: 20, description: 'מחיר לדקה (אגורות)' })
  @IsOptional() @IsInt() @Min(0) pricePerMinuteMinor?: number;

  @ApiPropertyOptional({ example: 1200 })
  @IsOptional() @IsInt() @Min(0) pricePerHourMinor?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional() @IsInt() @Min(0) minChargeMinor?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional() @IsInt() @Min(0) minMinutes?: number;

  @ApiPropertyOptional({ example: 'UP' })
  @IsOptional() @IsString() roundingRule?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean() restartOnEnd?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean() chargePrinting?: boolean;
}

class UpdateComputerGroupDto extends PartialType(CreateComputerGroupDto) {}

@Injectable()
class ComputerGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthPrincipal, query: PaginationQuery) {
    const where = { tenantId: user.tenantId, deletedAt: null, ...branchScopeFilter(user) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.computerGroup.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { name: 'asc' },
        include: { _count: { select: { computers: true } } },
      }),
      this.prisma.computerGroup.count({ where }),
    ]);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async create(user: AuthPrincipal, dto: CreateComputerGroupDto) {
    assertBranchScope(user, dto.branchId);
    const group = await this.prisma.computerGroup.create({
      data: { ...dto, tenantId: user.tenantId },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: dto.branchId,
      action: 'computer.group.create', entity: 'ComputerGroup', entityId: group.id, newValue: group,
    });
    return group;
  }

  async update(user: AuthPrincipal, id: string, dto: UpdateComputerGroupDto) {
    const before = await this.prisma.computerGroup.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!before) throw new NotFoundGroup();
    assertBranchScope(user, before.branchId);
    const group = await this.prisma.computerGroup.update({ where: { id }, data: dto });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: before.branchId,
      action: 'computer.group.update', entity: 'ComputerGroup', entityId: id,
      previousValue: before, newValue: group,
    });
    return group;
  }

  async remove(user: AuthPrincipal, id: string) {
    const before = await this.prisma.computerGroup.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!before) throw new NotFoundGroup();
    assertBranchScope(user, before.branchId);
    await this.prisma.computerGroup.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: before.branchId,
      action: 'computer.group.delete', entity: 'ComputerGroup', entityId: id,
    });
    return { success: true };
  }
}

// Local not-found helper to keep the module self-contained.
class NotFoundGroup extends NotFoundException {
  constructor() {
    super({ code: 'NOT_FOUND', message: 'קבוצת מחשבים לא נמצאה' });
  }
}

@ApiTags('computer-groups')
@ApiBearerAuth()
@Controller('computer-groups')
class ComputerGroupsController {
  constructor(private readonly groups: ComputerGroupsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COMPUTER_READ)
  @ApiOperation({ summary: 'רשימת קבוצות מחשבים' })
  list(@CurrentUser() user: AuthPrincipal, @Query() query: Record<string, string>) {
    return this.groups.list(user, paginationQuerySchema.parse(query));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COMPUTER_GROUP_MANAGE)
  @ApiOperation({ summary: 'יצירת קבוצת מחשבים' })
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateComputerGroupDto) {
    return this.groups.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.COMPUTER_GROUP_MANAGE)
  @ApiOperation({ summary: 'עדכון קבוצת מחשבים' })
  update(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: UpdateComputerGroupDto) {
    return this.groups.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.COMPUTER_GROUP_MANAGE)
  @ApiOperation({ summary: 'מחיקת קבוצת מחשבים' })
  remove(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.groups.remove(user, id);
  }
}

@Module({
  controllers: [ComputerGroupsController],
  providers: [ComputerGroupsService],
})
export class ComputerGroupsModule {}
