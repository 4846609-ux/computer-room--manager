import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { AgentCommandStatus } from '@crm/database';
import { WS_EVENTS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.module';
import { assertBranchScope } from '../common/scope';
import type { AppConfig } from '../config/configuration';

const LOW_DISK_MB = 2048;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface HeartbeatInput {
  cpuPercent?: number;
  ramPercent?: number;
  diskFreeMb?: number;
  loggedInUser?: string;
  localIp?: string;
  agentVersion?: string;
  antivirusOk?: boolean;
}

@Injectable()
export class AgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Employee-initiated: mint a single-use, time-boxed installation token. */
  async provision(user: AuthPrincipal, computerId: string) {
    const computer = await this.prisma.computer.findFirst({
      where: { id: computerId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!computer) throw new BadRequestException({ code: 'NOT_FOUND', message: 'מחשב לא נמצא' });
    assertBranchScope(user, computer.branchId);

    const rawToken = randomBytes(24).toString('hex');
    const ttl = this.config.get('agent', { infer: true }).installTokenTtl;
    const tokenExpires = new Date(Date.now() + ttl * 1000);

    await this.prisma.computerAgent.upsert({
      where: { computerId },
      create: {
        tenantId: user.tenantId,
        computerId,
        secretHash: '', // set on register
        installToken: sha256(rawToken),
        tokenExpires,
      },
      update: { installToken: sha256(rawToken), tokenExpires, secretHash: '' },
    });

    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: computer.branchId,
      action: 'agent.provision', entity: 'Computer', entityId: computerId,
    });

    return {
      installToken: rawToken,
      tokenExpires,
      organizationId: user.tenantId,
      branchId: computer.branchId,
      computerId,
    };
  }

  /** Agent-initiated: exchange an install token for a long-lived agent secret. */
  async register(installToken: string, systemId: string, version?: string) {
    const hash = sha256(installToken);
    const agent = await this.prisma.computerAgent.findFirst({
      where: { installToken: hash, tokenExpires: { gt: new Date() } },
      include: { computer: true },
    });
    if (!agent || agent.computer.systemId !== systemId) {
      throw new UnauthorizedException({ code: 'AUTH_INVALID_CREDENTIALS', message: 'טוקן התקנה לא תקף' });
    }

    const rawSecret = randomBytes(32).toString('hex');
    await this.prisma.computerAgent.update({
      where: { id: agent.id },
      data: {
        secretHash: sha256(rawSecret),
        version,
        installToken: null, // burn the single-use token
        tokenExpires: null,
        registeredAt: new Date(),
        isOnline: true,
        lastHeartbeat: new Date(),
      },
    });
    await this.prisma.computer.update({
      where: { id: agent.computerId },
      data: { agentVersion: version, status: 'AVAILABLE', lastSeenAt: new Date() },
    });

    return { agentId: agent.id, agentSecret: rawSecret };
  }

  private async authenticateAgent(agentId: string, secret: string) {
    const agent = await this.prisma.computerAgent.findUnique({
      where: { id: agentId },
      include: { computer: true },
    });
    if (!agent || !agent.secretHash || agent.secretHash !== sha256(secret)) {
      throw new UnauthorizedException({ code: 'AUTH_INVALID_CREDENTIALS', message: 'אימות Agent נכשל' });
    }
    return agent;
  }

  async heartbeat(agentId: string, secret: string, input: HeartbeatInput) {
    const agent = await this.authenticateAgent(agentId, secret);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.agentHeartbeat.create({
        data: {
          tenantId: agent.tenantId,
          agentId: agent.id,
          cpuPercent: input.cpuPercent,
          ramPercent: input.ramPercent,
          diskFreeMb: input.diskFreeMb,
          loggedInUser: input.loggedInUser,
          localIp: input.localIp,
          agentVersion: input.agentVersion,
          antivirusOk: input.antivirusOk,
        },
      }),
      this.prisma.computerAgent.update({
        where: { id: agent.id },
        data: { isOnline: true, lastHeartbeat: now, version: input.agentVersion ?? agent.version },
      }),
      this.prisma.computer.update({
        where: { id: agent.computerId },
        data: {
          lastSeenAt: now,
          localIp: input.localIp ?? agent.computer.localIp,
          diskFreeMb: input.diskFreeMb ?? agent.computer.diskFreeMb,
          agentVersion: input.agentVersion ?? agent.computer.agentVersion,
          antivirusOk: input.antivirusOk ?? agent.computer.antivirusOk,
        },
      }),
    ]);

    this.realtime.emitToBranch(
      WS_EVENTS.COMPUTER_METRICS_UPDATED,
      agent.tenantId,
      agent.computer.branchId,
      { computerId: agent.computerId, metrics: input },
    );

    // Raise a manager alert on low disk space (deduped by the client via read state).
    if (input.diskFreeMb != null && input.diskFreeMb < LOW_DISK_MB) {
      await this.notifications.raiseManagerAlert(
        agent.tenantId,
        `דיסק כמעט מלא: ${agent.computer.name}`,
        `נותרו ${input.diskFreeMb}MB בעמדה ${agent.computer.stationNumber ?? agent.computer.name}`,
        'WARNING',
      );
    }

    // Return any pending commands for this agent to execute.
    const commands = await this.prisma.agentCommand.findMany({
      where: { agentId: agent.id, status: AgentCommandStatus.QUEUED },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    return { ok: true, commands };
  }

  async commandResult(
    agentId: string,
    secret: string,
    commandId: string,
    status: AgentCommandStatus,
    detail?: string,
  ) {
    const agent = await this.authenticateAgent(agentId, secret);
    const command = await this.prisma.agentCommand.findFirst({
      where: { id: commandId, agentId: agent.id },
    });
    if (!command) throw new BadRequestException({ code: 'NOT_FOUND', message: 'פקודה לא נמצאה' });

    await this.prisma.$transaction([
      this.prisma.agentCommand.update({ where: { id: commandId }, data: { status } }),
      this.prisma.agentCommandResult.upsert({
        where: { commandId },
        create: { tenantId: agent.tenantId, commandId, status, detail },
        update: { status, detail, completedAt: new Date() },
      }),
    ]);

    this.realtime.emitToBranch(
      WS_EVENTS.AGENT_COMMAND_COMPLETED,
      agent.tenantId,
      agent.computer.branchId,
      { commandId, status, computerId: agent.computerId },
    );
    return { ok: true };
  }
}
