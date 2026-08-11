import { createHmac, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentCommandStatus, type Prisma } from '@crm/database';
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_LABELS,
  AGENT_ACTIONS,
  presetForLevel,
  type AccessLevel,
  type AccessPolicyPayload,
  type AccessProfileInput,
  type AuthPrincipal,
  type PaginatedResult,
  type PaginationQuery,
  type UpdateAccessProfileInput,
} from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';

/**
 * Access profiles = usage levels ("רמות משתמש") assigned to customers:
 * computer-only, email-only, custom, or full — plus separate video-blocking
 * (local files vs. internet). Tenant-scoped; the Agent enforces on the station.
 */
@Injectable()
export class AccessProfilesService {
  private readonly logger = new Logger(AccessProfilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private toData(input: Partial<AccessProfileInput>): Prisma.AccessProfileUpdateInput {
    const data: Record<string, unknown> = { ...input };
    // Json fields must be passed as-is; drop undefined so PATCH stays partial.
    for (const key of Object.keys(data)) {
      if (data[key] === undefined) delete data[key];
    }
    return data as Prisma.AccessProfileUpdateInput;
  }

  async list(
    user: AuthPrincipal,
    query: PaginationQuery,
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.AccessProfileWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null,
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.accessProfile.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.accessProfile.count({ where }),
    ]);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async get(user: AuthPrincipal, id: string): Promise<unknown> {
    const profile = await this.prisma.accessProfile.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!profile) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'פרופיל גישה לא נמצא' });
    }
    return profile;
  }

  async create(user: AuthPrincipal, input: AccessProfileInput): Promise<unknown> {
    const existing = await this.prisma.accessProfile.findFirst({
      where: { tenantId: user.tenantId, name: input.name, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException({ code: 'VALIDATION_FAILED', message: 'שם פרופיל כבר קיים' });
    }

    const profile = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.accessProfile.updateMany({
          where: { tenantId: user.tenantId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.accessProfile.create({
        data: {
          tenantId: user.tenantId,
          name: input.name,
          level: input.level,
          allowComputer: input.allowComputer,
          allowInternet: input.allowInternet,
          allowEmail: input.allowEmail,
          allowApps: input.allowApps,
          allowUsb: input.allowUsb,
          allowPrinting: input.allowPrinting,
          blockVideoOnComputer: input.blockVideoOnComputer,
          blockVideoOnInternet: input.blockVideoOnInternet,
          blockedSites: input.blockedSites ?? [],
          allowedSites: input.allowedSites ?? [],
          isDefault: input.isDefault ?? false,
        },
      });
    });

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.employeeId,
      action: 'access.profile.create',
      entity: 'AccessProfile',
      entityId: profile.id,
      newValue: profile,
    });
    return profile;
  }

  async update(
    user: AuthPrincipal,
    id: string,
    input: UpdateAccessProfileInput,
  ): Promise<unknown> {
    const before = await this.prisma.accessProfile.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!before) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'פרופיל גישה לא נמצא' });
    }

    const profile = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.accessProfile.updateMany({
          where: { tenantId: user.tenantId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.accessProfile.update({ where: { id }, data: this.toData(input) });
    });

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.employeeId,
      action: 'access.profile.update',
      entity: 'AccessProfile',
      entityId: id,
      previousValue: before,
      newValue: profile,
    });
    return profile;
  }

  async remove(user: AuthPrincipal, id: string): Promise<{ success: true }> {
    const before = await this.prisma.accessProfile.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!before) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'פרופיל גישה לא נמצא' });
    }
    // Detach from customers so we never leave a dangling reference.
    await this.prisma.$transaction([
      this.prisma.customer.updateMany({
        where: { tenantId: user.tenantId, accessProfileId: id },
        data: { accessProfileId: null },
      }),
      this.prisma.accessProfile.update({
        where: { id },
        data: { deletedAt: new Date(), isDefault: false },
      }),
    ]);

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.employeeId,
      action: 'access.profile.delete',
      entity: 'AccessProfile',
      entityId: id,
      previousValue: before,
    });
    return { success: true };
  }

  /**
   * Create the built-in levels for a tenant if none exist yet. Idempotent — safe
   * to call on demand (e.g. from the UI "צור פרופילי ברירת מחדל" action).
   */
  async ensureDefaults(user: AuthPrincipal): Promise<{ created: number }> {
    const count = await this.prisma.accessProfile.count({
      where: { tenantId: user.tenantId, deletedAt: null },
    });
    if (count > 0) return { created: 0 };

    const levels: AccessLevel[] = [
      ACCESS_LEVELS.FULL,
      ACCESS_LEVELS.COMPUTER_ONLY,
      ACCESS_LEVELS.EMAIL_ONLY,
    ];
    let created = 0;
    for (const level of levels) {
      const policy = presetForLevel(level);
      await this.prisma.accessProfile.create({
        data: {
          tenantId: user.tenantId,
          name: ACCESS_LEVEL_LABELS[level],
          level,
          allowComputer: policy.allowComputer,
          allowInternet: policy.allowInternet,
          allowEmail: policy.allowEmail,
          allowApps: policy.allowApps,
          allowUsb: policy.allowUsb,
          allowPrinting: policy.allowPrinting,
          blockVideoOnComputer: policy.blockVideoOnComputer,
          blockVideoOnInternet: policy.blockVideoOnInternet,
          blockedSites: policy.blockedSites,
          allowedSites: policy.allowedSites,
          isDefault: level === ACCESS_LEVELS.FULL,
        },
      });
      created += 1;
    }
    return { created };
  }

  private sign(commandId: string, action: string, expiresAt: Date): string {
    const secret = this.config.get('agent', { infer: true }) as { signingSecret: string };
    return createHmac('sha256', secret.signingSecret)
      .update(`${commandId}.${action}.${expiresAt.getTime()}`)
      .digest('base64');
  }

  /**
   * Push a customer's access policy onto the station they just sat at. Best-effort:
   * if the customer has no profile, or the computer has no Agent installed, this is
   * a safe no-op. Never throws into the caller (session open must not fail on this).
   */
  async applyToComputer(
    tenantId: string,
    computerId: string,
    customerId: string | null | undefined,
    issuedById: string | null,
  ): Promise<void> {
    try {
      if (!customerId) return;
      const customer = await this.prisma.customer.findFirst({
        where: { id: customerId, tenantId },
        include: { accessProfile: true },
      });
      const profile = customer?.accessProfile;
      if (!profile || profile.deletedAt) return;

      const computer = await this.prisma.computer.findFirst({
        where: { id: computerId, tenantId, deletedAt: null },
        include: { agent: true },
      });
      if (!computer?.agent) return; // nothing to enforce without an Agent

      const payload: AccessPolicyPayload = {
        profileId: profile.id,
        profileName: profile.name,
        level: profile.level as AccessLevel,
        allowComputer: profile.allowComputer,
        allowInternet: profile.allowInternet,
        allowEmail: profile.allowEmail,
        allowApps: profile.allowApps,
        allowUsb: profile.allowUsb,
        allowPrinting: profile.allowPrinting,
        blockVideoOnComputer: profile.blockVideoOnComputer,
        blockVideoOnInternet: profile.blockVideoOnInternet,
        blockedSites: (profile.blockedSites as string[]) ?? [],
        allowedSites: (profile.allowedSites as string[]) ?? [],
      };

      const commandId = randomUUID();
      const action = AGENT_ACTIONS.APPLY_ACCESS_POLICY;
      const expiresAt = new Date(Date.now() + 60_000);
      await this.prisma.agentCommand.create({
        data: {
          id: commandId,
          tenantId,
          agentId: computer.agent.id,
          action,
          params: payload as unknown as object,
          status: AgentCommandStatus.QUEUED,
          issuedById,
          expiresAt,
          signature: this.sign(commandId, action, expiresAt),
        },
      });
    } catch (err) {
      this.logger.warn(`applyToComputer failed (non-fatal): ${String(err)}`);
    }
  }
}
