import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MessageDirection, type Prisma } from '@crm/database';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';

/**
 * Customer inquiries = two-way chat between staff and customers ("פניות לקוחות").
 * A conversation is all messages for one customer; unread = INBOUND with readAt
 * null. Inbound messages are created from the kiosk/customer app; here staff read
 * the threads and reply.
 */
@Injectable()
class InquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** One entry per customer that has any messages: last message + unread count. */
  async listConversations(user: AuthPrincipal, onlyUnread: boolean) {
    const messages = await this.prisma.customerMessage.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      include: { customer: { select: { id: true, fullName: true, customerNumber: true } } },
      take: 2000,
    });

    const byCustomer = new Map<
      string,
      {
        customerId: string;
        customerName: string;
        customerNumber: number;
        lastBody: string;
        lastAt: Date;
        unread: number;
      }
    >();
    for (const m of messages) {
      let conv = byCustomer.get(m.customerId);
      if (!conv) {
        conv = {
          customerId: m.customerId,
          customerName: m.customer.fullName,
          customerNumber: m.customer.customerNumber,
          lastBody: m.body,
          lastAt: m.createdAt,
          unread: 0,
        };
        byCustomer.set(m.customerId, conv);
      }
      if (m.direction === MessageDirection.INBOUND && m.readAt === null) conv.unread += 1;
    }

    let list = [...byCustomer.values()];
    if (onlyUnread) list = list.filter((c) => c.unread > 0);
    list.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
    const totalUnread = [...byCustomer.values()].reduce((s, c) => s + c.unread, 0);
    return { data: list, meta: { totalUnread } };
  }

  async thread(user: AuthPrincipal, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId: user.tenantId },
      select: { id: true, fullName: true, customerNumber: true },
    });
    if (!customer) throw new BadRequestException({ code: 'NOT_FOUND', message: 'לקוח לא נמצא' });

    const messages = await this.prisma.customerMessage.findMany({
      where: { tenantId: user.tenantId, customerId },
      orderBy: { createdAt: 'asc' },
    });
    return { customer, messages };
  }

  async reply(user: AuthPrincipal, customerId: string, body: string) {
    const text = body?.trim();
    if (!text) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'הודעה ריקה' });

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!customer) throw new BadRequestException({ code: 'NOT_FOUND', message: 'לקוח לא נמצא' });

    const message = await this.prisma.customerMessage.create({
      data: {
        tenantId: user.tenantId,
        customerId,
        direction: MessageDirection.OUTBOUND,
        body: text,
        createdById: user.employeeId,
        readAt: new Date(),
      },
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.employeeId,
      action: 'inquiry.reply',
      entity: 'CustomerMessage',
      entityId: message.id,
      newValue: { customerId },
    });
    return message;
  }

  async markRead(user: AuthPrincipal, customerId: string) {
    const where: Prisma.CustomerMessageWhereInput = {
      tenantId: user.tenantId,
      customerId,
      direction: MessageDirection.INBOUND,
      readAt: null,
    };
    const res = await this.prisma.customerMessage.updateMany({ where, data: { readAt: new Date() } });
    return { updated: res.count };
  }
}

@ApiTags('inquiries')
@ApiBearerAuth()
@Controller('inquiries')
class InquiriesController {
  constructor(private readonly service: InquiriesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INQUIRY_READ)
  @ApiOperation({ summary: 'רשימת פניות (שיחות) עם לקוחות' })
  list(@CurrentUser() user: AuthPrincipal, @Query('unread') unread?: string) {
    return this.service.listConversations(user, unread === '1' || unread === 'true');
  }

  @Get(':customerId')
  @RequirePermissions(PERMISSIONS.INQUIRY_READ)
  @ApiOperation({ summary: 'שרשור הודעות של לקוח' })
  thread(@CurrentUser() user: AuthPrincipal, @Param('customerId') customerId: string) {
    return this.service.thread(user, customerId);
  }

  @Post(':customerId/read')
  @RequirePermissions(PERMISSIONS.INQUIRY_READ)
  @ApiOperation({ summary: 'סימון הודעות נכנסות כנקראו' })
  markRead(@CurrentUser() user: AuthPrincipal, @Param('customerId') customerId: string) {
    return this.service.markRead(user, customerId);
  }

  @Post(':customerId')
  @RequirePermissions(PERMISSIONS.INQUIRY_REPLY)
  @ApiOperation({ summary: 'שליחת תגובה ללקוח' })
  reply(
    @CurrentUser() user: AuthPrincipal,
    @Param('customerId') customerId: string,
    @Body() dto: { body: string },
  ) {
    return this.service.reply(user, customerId, dto?.body);
  }
}

@Module({
  controllers: [InquiriesController],
  providers: [InquiriesService],
})
export class InquiriesModule {}
