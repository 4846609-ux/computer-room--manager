import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AgentCommandStatus } from '@crm/database';
import {
  DISRUPTIVE_ACTIONS,
  isAgentAction,
  WS_EVENTS,
  type AgentAction,
  type AuthPrincipal,
  type PaginationQuery,
} from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { assertBranchScope, branchScopeFilter } from '../common/scope';
import type { AppConfig } from '../config/configuration';
import { CreateComputerDto, RemoteCommandDto, UpdateComputerDto } from './dto/computer.dto';

@Injectable()
export class ComputersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async list(user: AuthPrincipal, query: PaginationQuery) {
    const where = {
      tenantId: user.tenantId,
      deletedAt: null,
      ...branchScopeFilter(user),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { stationNumber: { contains: query.q } },
              { systemId: { contains: query.q } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.computer.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { stationNumber: 'asc' },
      }),
      this.prisma.computer.count({ where }),
    ]);

    // Enrich with related data (handle gracefully if missing)
    const enrichedData = await Promise.all(
      data.map(async (computer) => {
        const [group, agent] = await Promise.all([
          computer.groupId ? this.prisma.computerGroup.findUnique({ where: { id: computer.groupId } }).catch(() => null) : null,
          computer.id ? this.prisma.computerAgent.findUnique({ where: { computerId: computer.id } }).catch(() => null) : null,
        ]);
        return {
          ...computer,
          group: group ? { id: group.id, name: group.name, billingRatio: group.billingRatio } : null,
          agent: agent ? { isOnline: agent.isOnline, lastHeartbeat: agent.lastHeartbeat, version: agent.version } : null,
        };
      }),
    );

    return { data: enrichedData, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async get(user: AuthPrincipal, id: string) {
    const computer = await this.prisma.computer.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
      include: { group: true, agent: true },
    });
    if (!computer) throw new NotFoundException({ code: 'NOT_FOUND', message: 'מחשב לא נמצא' });
    return computer;
  }

  async create(user: AuthPrincipal, dto: CreateComputerDto) {
    assertBranchScope(user, dto.branchId);
    const exists = await this.prisma.computer.findFirst({
      where: { tenantId: user.tenantId, systemId: dto.systemId },
    });
    if (exists) {
      throw new ConflictException({ code: 'VALIDATION_FAILED', message: 'מזהה מערכת כבר קיים' });
    }
    const computer = await this.prisma.computer.create({
      data: { ...dto, tenantId: user.tenantId },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: dto.branchId,
      action: 'computer.create', entity: 'Computer', entityId: computer.id, newValue: computer,
    });
    return computer;
  }

  async update(user: AuthPrincipal, id: string, dto: UpdateComputerDto) {
    const before = await this.prisma.computer.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'מחשב לא נמצא' });
    assertBranchScope(user, before.branchId);
    const computer = await this.prisma.computer.update({ where: { id }, data: dto });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: before.branchId,
      action: 'computer.update', entity: 'Computer', entityId: id, previousValue: before, newValue: dto,
    });
    return computer;
  }

  async remove(user: AuthPrincipal, id: string) {
    const before = await this.prisma.computer.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'מחשב לא נמצא' });
    assertBranchScope(user, before.branchId);
    await this.prisma.computer.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: before.branchId,
      action: 'computer.delete', entity: 'Computer', entityId: id,
    });
    return { success: true };
  }

  async sendCommand(user: AuthPrincipal, id: string, dto: RemoteCommandDto) {
    if (!isAgentAction(dto.action)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'פעולה לא מאושרת',
        details: { action: dto.action },
      });
    }
    const action = dto.action as AgentAction;

    const computer = await this.prisma.computer.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
      include: { agent: true },
    });
    if (!computer) throw new NotFoundException({ code: 'NOT_FOUND', message: 'מחשב לא נמצא' });
    assertBranchScope(user, computer.branchId);
    if (!computer.agent) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'לא מותקן Agent על המחשב' });
    }

    const busy = computer.status === 'IN_USE';
    let condition: string | undefined;
    if (DISRUPTIVE_ACTIONS.includes(action) && busy && !dto.force) {
      if (!dto.afterSessionEnd) {
        throw new ConflictException({
          code: 'VALIDATION_FAILED',
          message: 'משתמש מחובר לעמדה — בחר "בצע מיד" או "בצע בסיום השימוש"',
        });
      }
      condition = 'AFTER_SESSION_END';
    }

    const ttl = 30_000;
    const expiresAt = new Date(Date.now() + ttl);
    const commandId = randomUUID();
    const signature = this.sign(commandId, action, expiresAt);

    const command = await this.prisma.agentCommand.create({
      data: {
        id: commandId,
        tenantId: user.tenantId,
        agentId: computer.agent.id,
        action,
        params: (dto.params ?? {}) as object,
        status: AgentCommandStatus.QUEUED,
        issuedById: user.employeeId,
        condition,
        expiresAt,
        signature,
      },
    });

    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: computer.branchId,
      action: 'computer.remote.command', entity: 'Computer', entityId: id,
      newValue: { action, condition: condition ?? 'IMMEDIATE' },
    });

    this.realtime.emitToBranch(WS_EVENTS.AGENT_COMMAND_SENT, user.tenantId, computer.branchId, {
      computerId: id,
      commandId: command.id,
      action,
      condition,
    });

    return { commandId: command.id, action, condition: condition ?? 'IMMEDIATE', expiresAt };
  }

  private sign(commandId: string, action: string, expiresAt: Date): string {
    const secret = this.config.get('agent', { infer: true }).signingSecret;
    return createHmac('sha256', secret)
      .update(`${commandId}.${action}.${expiresAt.getTime()}`)
      .digest('base64');
  }
}
