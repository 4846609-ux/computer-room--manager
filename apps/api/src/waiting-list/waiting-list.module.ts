import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { assertBranchScope } from '../common/scope';

class JoinWaitingListDto {
  @ApiProperty() @IsString() branchId!: string;
  @ApiProperty() @IsString() customerId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() computerGroupId?: string;
}

@Injectable()
class WaitingListService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthPrincipal, branchId?: string) {
    return this.prisma.waitingListEntry.findMany({
      where: { tenantId: user.tenantId, ...(branchId ? { branchId } : {}) },
      orderBy: { position: 'asc' },
      include: { customer: { select: { fullName: true, phone: true } } },
    });
  }

  async join(user: AuthPrincipal, dto: JoinWaitingListDto) {
    assertBranchScope(user, dto.branchId);
    const last = await this.prisma.waitingListEntry.findFirst({
      where: { tenantId: user.tenantId, branchId: dto.branchId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return this.prisma.waitingListEntry.create({
      data: {
        tenantId: user.tenantId,
        branchId: dto.branchId,
        customerId: dto.customerId,
        computerGroupId: dto.computerGroupId,
        position: (last?.position ?? 0) + 1,
      },
    });
  }

  async notify(user: AuthPrincipal, id: string) {
    const entry = await this.prisma.waitingListEntry.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!entry) throw new NotFoundException({ code: 'NOT_FOUND', message: 'רשומה לא נמצאה' });
    return this.prisma.waitingListEntry.update({ where: { id }, data: { notifiedAt: new Date() } });
  }

  async remove(user: AuthPrincipal, id: string) {
    const entry = await this.prisma.waitingListEntry.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!entry) throw new NotFoundException({ code: 'NOT_FOUND', message: 'רשומה לא נמצאה' });
    await this.prisma.waitingListEntry.delete({ where: { id } });
    return { success: true };
  }
}

@ApiTags('waiting-list')
@ApiBearerAuth()
@Controller('waiting-list')
class WaitingListController {
  constructor(private readonly service: WaitingListService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RESERVATION_READ)
  @ApiOperation({ summary: 'רשימת המתנה' })
  list(@CurrentUser() user: AuthPrincipal, @Query('branchId') branchId?: string) {
    return this.service.list(user, branchId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RESERVATION_MANAGE)
  @ApiOperation({ summary: 'הוספה לרשימת המתנה' })
  join(@CurrentUser() user: AuthPrincipal, @Body() dto: JoinWaitingListDto) {
    return this.service.join(user, dto);
  }

  @Post(':id/notify')
  @RequirePermissions(PERMISSIONS.RESERVATION_MANAGE)
  @ApiOperation({ summary: 'סימון שנשלחה הודעה' })
  notify(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.service.notify(user, id);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.RESERVATION_MANAGE)
  @ApiOperation({ summary: 'הסרה מרשימת המתנה' })
  remove(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}

@Module({
  controllers: [WaitingListController],
  providers: [WaitingListService],
})
export class WaitingListModule {}
