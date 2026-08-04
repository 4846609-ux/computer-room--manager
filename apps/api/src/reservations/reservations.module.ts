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
import { IsInt, IsISO8601, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { randomBytes } from 'node:crypto';
import { ReservationStatus } from '@crm/database';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { assertBranchScope, branchScopeFilter } from '../common/scope';

class CreateReservationDto {
  @ApiProperty({ example: 'branch-uuid' }) @IsString() branchId!: string;
  @ApiProperty({ example: 'customer-uuid' }) @IsString() customerId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() computerId?: string;
  @ApiProperty({ example: '2026-08-10T10:00:00Z' }) @IsISO8601() startAt!: string;
  @ApiProperty({ example: 60, description: 'משך בדקות' }) @IsInt() @Min(1) durationMin!: number;
  @ApiPropertyOptional({ description: 'מקדמה (אגורות)' }) @IsOptional() @IsInt() @Min(0) depositMinor?: number;
}

@Injectable()
class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthPrincipal, from?: string, to?: string) {
    return this.prisma.reservation.findMany({
      where: {
        tenantId: user.tenantId,
        ...branchScopeFilter(user),
        ...(from || to
          ? { startAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      },
      orderBy: { startAt: 'asc' },
      take: 200,
      include: {
        customer: { select: { fullName: true, phone: true } },
        computer: { select: { name: true, stationNumber: true } },
      },
    });
  }

  async create(user: AuthPrincipal, dto: CreateReservationDto) {
    assertBranchScope(user, dto.branchId);
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, tenantId: user.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException({ code: 'NOT_FOUND', message: 'לקוח לא נמצא' });

    const reservation = await this.prisma.reservation.create({
      data: {
        tenantId: user.tenantId,
        branchId: dto.branchId,
        customerId: dto.customerId,
        computerId: dto.computerId,
        startAt: new Date(dto.startAt),
        durationMin: dto.durationMin,
        depositMinor: dto.depositMinor ?? 0,
        confirmationCode: randomBytes(3).toString('hex').toUpperCase(),
      },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: dto.branchId,
      action: 'reservation.create', entity: 'Reservation', entityId: reservation.id,
      newValue: { startAt: dto.startAt, customerId: dto.customerId },
    });
    return reservation;
  }

  private async setStatus(user: AuthPrincipal, id: string, status: ReservationStatus, action: string) {
    const before = await this.prisma.reservation.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'הזמנה לא נמצאה' });
    assertBranchScope(user, before.branchId);
    const updated = await this.prisma.reservation.update({ where: { id }, data: { status } });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: before.branchId,
      action, entity: 'Reservation', entityId: id, newValue: { status },
    });
    return updated;
  }

  confirm(user: AuthPrincipal, id: string) {
    return this.setStatus(user, id, ReservationStatus.CONFIRMED, 'reservation.confirm');
  }
  checkIn(user: AuthPrincipal, id: string) {
    return this.setStatus(user, id, ReservationStatus.CHECKED_IN, 'reservation.checkin');
  }
  cancel(user: AuthPrincipal, id: string) {
    return this.setStatus(user, id, ReservationStatus.CANCELLED, 'reservation.cancel');
  }
  noShow(user: AuthPrincipal, id: string) {
    return this.setStatus(user, id, ReservationStatus.NO_SHOW, 'reservation.noshow');
  }
}

@ApiTags('reservations')
@ApiBearerAuth()
@Controller('reservations')
class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RESERVATION_READ)
  @ApiOperation({ summary: 'רשימת הזמנות' })
  list(@CurrentUser() user: AuthPrincipal, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reservations.list(user, from, to);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RESERVATION_MANAGE)
  @ApiOperation({ summary: 'יצירת הזמנה' })
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateReservationDto) {
    return this.reservations.create(user, dto);
  }

  @Post(':id/confirm')
  @RequirePermissions(PERMISSIONS.RESERVATION_MANAGE)
  @ApiOperation({ summary: 'אישור הזמנה' })
  confirm(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.reservations.confirm(user, id);
  }

  @Post(':id/check-in')
  @RequirePermissions(PERMISSIONS.RESERVATION_MANAGE)
  @ApiOperation({ summary: 'צ׳ק-אין' })
  checkIn(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.reservations.checkIn(user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.RESERVATION_MANAGE)
  @ApiOperation({ summary: 'ביטול הזמנה' })
  cancel(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.reservations.cancel(user, id);
  }

  @Post(':id/no-show')
  @RequirePermissions(PERMISSIONS.RESERVATION_MANAGE)
  @ApiOperation({ summary: 'סימון אי-הגעה' })
  noShow(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.reservations.noShow(user, id);
  }
}

@Module({
  controllers: [ReservationsController],
  providers: [ReservationsService],
})
export class ReservationsModule {}
