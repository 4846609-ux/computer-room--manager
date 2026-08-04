import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { Prisma } from '@crm/database';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { assertBranchScope, branchScopeFilter } from '../common/scope';

class CreateRoomDto {
  @ApiProperty({ example: 'branch-uuid' }) @IsString() branchId!: string;
  @ApiProperty({ example: 'אולם ראשי' }) @IsString() @MinLength(1) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() floor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() wing?: string;
}

class LayoutItem {
  @ApiProperty() @IsString() computerId!: string;
  @ApiProperty() @IsNumber() x!: number;
  @ApiProperty() @IsNumber() y!: number;
}

class SaveFloorPlanDto {
  @ApiPropertyOptional({ default: 1000 }) @IsOptional() @IsInt() width?: number;
  @ApiPropertyOptional({ default: 700 }) @IsOptional() @IsInt() height?: number;
  @ApiProperty({ type: [LayoutItem] }) @IsArray() layout!: LayoutItem[];
}

@Injectable()
class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listRooms(user: AuthPrincipal) {
    return this.prisma.room.findMany({
      where: { tenantId: user.tenantId, deletedAt: null, ...branchScopeFilter(user) },
      orderBy: { name: 'asc' },
      include: { branch: { select: { id: true, name: true } }, _count: { select: { computers: true } } },
    });
  }

  async createRoom(user: AuthPrincipal, dto: CreateRoomDto) {
    assertBranchScope(user, dto.branchId);
    const room = await this.prisma.room.create({ data: { ...dto, tenantId: user.tenantId } });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: dto.branchId,
      action: 'room.create', entity: 'Room', entityId: room.id, newValue: { name: dto.name },
    });
    return room;
  }

  /** Room floor view: computers (with live status) + saved positions. */
  async floor(user: AuthPrincipal, roomId: string) {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, tenantId: user.tenantId, deletedAt: null },
      include: { floorPlan: true },
    });
    if (!room) throw new NotFoundException({ code: 'NOT_FOUND', message: 'חדר לא נמצא' });
    assertBranchScope(user, room.branchId);

    const computers = await this.prisma.computer.findMany({
      where: { tenantId: user.tenantId, roomId, deletedAt: null },
      select: {
        id: true, name: true, stationNumber: true, status: true, localIp: true,
        agentVersion: true, lastSeenAt: true, diskFreeMb: true,
      },
    });

    // Attach active session info (customer + billing) for occupied stations.
    const activeSessions = await this.prisma.usageSession.findMany({
      where: {
        tenantId: user.tenantId,
        computerId: { in: computers.map((c) => c.id) },
        status: { in: ['ACTIVE', 'PAUSED'] },
      },
      select: {
        computerId: true, startedAt: true,
        customer: { select: { fullName: true } },
      },
    });
    const sessionByComputer = new Map(activeSessions.map((s) => [s.computerId, s]));

    return {
      room: { id: room.id, name: room.name, floor: room.floor, wing: room.wing },
      floorPlan: room.floorPlan ?? { width: 1000, height: 700, layout: [] },
      computers: computers.map((c) => {
        const session = sessionByComputer.get(c.id);
        return {
          ...c,
          connectedUser: session?.customer?.fullName ?? null,
          sessionStartedAt: session?.startedAt ?? null,
        };
      }),
    };
  }

  async saveFloor(user: AuthPrincipal, roomId: string, dto: SaveFloorPlanDto) {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!room) throw new NotFoundException({ code: 'NOT_FOUND', message: 'חדר לא נמצא' });
    assertBranchScope(user, room.branchId);

    const plan = await this.prisma.floorPlan.upsert({
      where: { roomId },
      create: {
        tenantId: user.tenantId,
        roomId,
        width: dto.width ?? 1000,
        height: dto.height ?? 700,
        layout: dto.layout as unknown as Prisma.InputJsonValue,
      },
      update: {
        width: dto.width ?? 1000,
        height: dto.height ?? 700,
        layout: dto.layout as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: room.branchId,
      action: 'floorplan.save', entity: 'FloorPlan', entityId: plan.id,
      newValue: { count: dto.layout.length },
    });
    return plan;
  }
}

@ApiTags('rooms')
@ApiBearerAuth()
@Controller('rooms')
class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ROOM_READ)
  @ApiOperation({ summary: 'רשימת חדרים' })
  list(@CurrentUser() user: AuthPrincipal) {
    return this.rooms.listRooms(user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ROOM_MANAGE)
  @ApiOperation({ summary: 'יצירת חדר' })
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateRoomDto) {
    return this.rooms.createRoom(user, dto);
  }

  @Get(':id/floor')
  @RequirePermissions(PERMISSIONS.ROOM_READ)
  @ApiOperation({ summary: 'תצוגת מפת חדר עם מצב חי' })
  floor(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.rooms.floor(user, id);
  }

  @Put(':id/floor')
  @RequirePermissions(PERMISSIONS.FLOORPLAN_MANAGE)
  @ApiOperation({ summary: 'שמירת פריסת מפת חדר' })
  saveFloor(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: SaveFloorPlanDto) {
    return this.rooms.saveFloor(user, id, dto);
  }
}

@Module({
  controllers: [RoomsController],
  providers: [RoomsService],
})
export class RoomsModule {}
