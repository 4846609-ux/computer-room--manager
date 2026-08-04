import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { TicketCategory, TicketPriority, TicketStatus } from '@crm/database';
import { PERMISSIONS, WS_EVENTS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RealtimeModule } from '../realtime/realtime.module';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { assertBranchScope, branchScopeFilter } from '../common/scope';

class CreateTicketDto {
  @ApiProperty({ example: 'branch-uuid' }) @IsString() branchId!: string;
  @ApiProperty({ example: 'מסך לא נדלק' }) @IsString() @MinLength(1) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: TicketCategory }) @IsEnum(TicketCategory) category!: TicketCategory;
  @ApiPropertyOptional({ enum: TicketPriority }) @IsOptional() @IsEnum(TicketPriority) priority?: TicketPriority;
  @ApiPropertyOptional() @IsOptional() @IsString() computerId?: string;
}

class UpdateTicketDto {
  @ApiPropertyOptional({ enum: TicketStatus }) @IsOptional() @IsEnum(TicketStatus) status?: TicketStatus;
  @ApiPropertyOptional({ enum: TicketPriority }) @IsOptional() @IsEnum(TicketPriority) priority?: TicketPriority;
  @ApiPropertyOptional() @IsOptional() @IsString() assignedToId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() resolution?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) costMinor?: number;
}

@Injectable()
class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
  ) {}

  list(user: AuthPrincipal, status?: string) {
    return this.prisma.maintenanceTicket.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        ...branchScopeFilter(user),
        ...(status ? { status: status as TicketStatus } : {}),
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: { computer: { select: { name: true, stationNumber: true } } },
    });
  }

  async create(user: AuthPrincipal, dto: CreateTicketDto) {
    assertBranchScope(user, dto.branchId);
    const ticket = await this.prisma.$transaction(async (tx) => {
      const last = await tx.maintenanceTicket.findFirst({
        where: { tenantId: user.tenantId },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      return tx.maintenanceTicket.create({
        data: {
          tenantId: user.tenantId,
          branchId: dto.branchId,
          number: (last?.number ?? 0) + 1,
          title: dto.title,
          description: dto.description,
          category: dto.category,
          priority: dto.priority ?? TicketPriority.MEDIUM,
          computerId: dto.computerId,
          reportedById: user.employeeId,
        },
      });
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: dto.branchId,
      action: 'maintenance.create', entity: 'MaintenanceTicket', entityId: ticket.id,
      newValue: { number: ticket.number, title: ticket.title },
    });
    this.realtime.emitToBranch(WS_EVENTS.MAINTENANCE_CREATED, user.tenantId, dto.branchId, {
      ticketId: ticket.id,
      number: ticket.number,
    });
    return ticket;
  }

  async update(user: AuthPrincipal, id: string, dto: UpdateTicketDto) {
    const before = await this.prisma.maintenanceTicket.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'קריאה לא נמצאה' });
    assertBranchScope(user, before.branchId);

    const resolvedAt =
      dto.status && ['RESOLVED', 'CLOSED'].includes(dto.status) && !before.resolvedAt
        ? new Date()
        : before.resolvedAt;

    const ticket = await this.prisma.maintenanceTicket.update({
      where: { id },
      data: { ...dto, resolvedAt },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: before.branchId,
      action: 'maintenance.update', entity: 'MaintenanceTicket', entityId: id,
      previousValue: { status: before.status }, newValue: dto,
    });
    return ticket;
  }
}

@ApiTags('maintenance')
@ApiBearerAuth()
@Controller('maintenance/tickets')
class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MAINTENANCE_READ)
  @ApiOperation({ summary: 'רשימת קריאות שירות' })
  list(@CurrentUser() user: AuthPrincipal, @Query('status') status?: string) {
    return this.maintenance.list(user, status);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'פתיחת קריאת שירות' })
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateTicketDto) {
    return this.maintenance.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'עדכון קריאה (סטטוס/טיפול)' })
  update(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.maintenance.update(user, id, dto);
  }
}

@Module({
  imports: [RealtimeModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
