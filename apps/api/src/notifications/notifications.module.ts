import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { NotificationChannel, NotificationSeverity } from '@crm/database';
import { PERMISSIONS, WS_EVENTS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';

class SendNotificationDto {
  @ApiProperty({ example: 'תחזוקה מתוכננת' }) @IsString() @MinLength(1) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  @ApiPropertyOptional({ enum: NotificationChannel }) @IsOptional() @IsEnum(NotificationChannel) channel?: NotificationChannel;
  @ApiPropertyOptional({ enum: NotificationSeverity }) @IsOptional() @IsEnum(NotificationSeverity) severity?: NotificationSeverity;
  @ApiPropertyOptional({ description: 'MANAGER | CUSTOMER | EMPLOYEE' }) @IsOptional() @IsString() audience?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recipientId?: string;
}

/**
 * Notification center. Records notifications and (for IN_APP) surfaces them to the
 * manager console. External channels (SMS/WhatsApp/email/push) are delivered through
 * provider adapters — recorded here and dispatched by a background worker.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Internal helper other modules use to raise a manager alert. */
  async raiseManagerAlert(
    tenantId: string,
    title: string,
    body?: string,
    severity: NotificationSeverity = NotificationSeverity.INFO,
  ) {
    return this.prisma.notification.create({
      data: {
        tenantId,
        channel: NotificationChannel.IN_APP,
        severity,
        audience: 'MANAGER',
        title,
        body,
        sentAt: new Date(),
      },
    });
  }

  listForManager(user: AuthPrincipal) {
    return this.prisma.notification.findMany({
      where: { tenantId: user.tenantId, audience: 'MANAGER' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async unreadCount(user: AuthPrincipal) {
    const count = await this.prisma.notification.count({
      where: { tenantId: user.tenantId, audience: 'MANAGER', readAt: null },
    });
    return { count };
  }

  async send(user: AuthPrincipal, dto: SendNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        tenantId: user.tenantId,
        channel: dto.channel ?? NotificationChannel.IN_APP,
        severity: dto.severity ?? NotificationSeverity.INFO,
        audience: dto.audience ?? 'MANAGER',
        recipientId: dto.recipientId,
        title: dto.title,
        body: dto.body,
        sentAt: new Date(),
      },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'notification.send', entity: 'Notification', entityId: notification.id,
      newValue: { title: dto.title, channel: notification.channel },
    });
    return notification;
  }

  async markRead(user: AuthPrincipal, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!notification) throw new NotFoundException({ code: 'NOT_FOUND', message: 'התראה לא נמצאה' });
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.NOTIFICATION_READ)
  @ApiOperation({ summary: 'מרכז התראות' })
  list(@CurrentUser() user: AuthPrincipal) {
    return this.notifications.listForManager(user);
  }

  @Get('unread-count')
  @RequirePermissions(PERMISSIONS.NOTIFICATION_READ)
  @ApiOperation({ summary: 'מספר התראות שלא נקראו' })
  unread(@CurrentUser() user: AuthPrincipal) {
    return this.notifications.unreadCount(user);
  }

  @Post('send')
  @RequirePermissions(PERMISSIONS.NOTIFICATION_SEND)
  @ApiOperation({ summary: 'שליחת התראה/הודעה' })
  send(@CurrentUser() user: AuthPrincipal, @Body() dto: SendNotificationDto) {
    return this.notifications.send(user, dto);
  }

  @Post(':id/read')
  @RequirePermissions(PERMISSIONS.NOTIFICATION_READ)
  @ApiOperation({ summary: 'סימון כנקרא' })
  markRead(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.notifications.markRead(user, id);
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
