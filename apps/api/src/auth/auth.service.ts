import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthPrincipal, LoginInput } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { generateBase32Secret, otpauthUri, verifyTotp } from './totp';
import type { AppConfig } from '../config/configuration';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  principal: AuthPrincipal;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Resolve the effective permission/role/branch set for an employee. */
  private async buildPrincipal(employeeId: string, tenantId: string): Promise<AuthPrincipal> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { employeeId, tenantId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    const permissions = new Set<string>();
    const roles = new Set<string>();
    const branchIds = new Set<string>();
    let hasGlobalScope = false;

    for (const ur of userRoles) {
      roles.add(ur.role.key);
      for (const rp of ur.role.permissions) permissions.add(rp.permission.key);
      const scoped = (ur.branchIds as string[]) ?? [];
      if (scoped.length === 0) hasGlobalScope = true;
      else scoped.forEach((b) => branchIds.add(b));
    }

    return {
      employeeId,
      tenantId,
      roles: [...roles],
      permissions: [...permissions],
      // empty array => access to all branches within the tenant
      branchIds: hasGlobalScope ? [] : [...branchIds],
    };
  }

  async login(input: LoginInput): Promise<LoginResult> {
    // Emails are unique per tenant; for MVP we resolve by email across active
    // employees. Multi-tenant collisions should pass an explicit tenant hint.
    const employee = await this.prisma.employee.findFirst({
      where: { email: input.identifier.toLowerCase(), status: 'ACTIVE', deletedAt: null },
    });

    const genericError = new UnauthorizedException({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'שם משתמש או סיסמה שגויים',
    });

    if (!employee) {
      // Perform a dummy verify to reduce timing side-channels.
      await this.passwords.verify(
        '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$b3Jhbmdl',
        input.password,
      );
      throw genericError;
    }

    const ok = await this.passwords.verify(employee.passwordHash, input.password);
    if (!ok) throw genericError;

    if (employee.twoFactorEnabled) {
      if (!input.twoFactorCode) {
        throw new UnauthorizedException({
          code: 'AUTH_2FA_REQUIRED',
          message: 'נדרש קוד אימות דו-שלבי',
        });
      }
      const ok2fa =
        !!employee.twoFactorSecret &&
        verifyTotp(employee.twoFactorSecret, input.twoFactorCode, Math.floor(Date.now() / 1000));
      if (!ok2fa) throw genericError;
    }

    const principal = await this.buildPrincipal(employee.id, employee.tenantId);
    const tokens = await this.issueTokens(principal);

    await this.prisma.employee.update({
      where: { id: employee.id },
      data: { lastLoginAt: new Date() },
    });

    return { ...tokens, principal };
  }

  private async issueTokens(
    principal: AuthPrincipal,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const jwtCfg = this.config.get('jwt', { infer: true });
    const accessToken = await this.jwt.signAsync(
      {
        sub: principal.employeeId,
        tenantId: principal.tenantId,
        roles: principal.roles,
        permissions: principal.permissions,
        branchIds: principal.branchIds,
      },
      { secret: jwtCfg.accessSecret, expiresIn: jwtCfg.accessTtl },
    );

    // Opaque refresh token, stored hashed with a rotation family.
    const rawRefresh = randomUUID() + randomUUID();
    const tokenHash = createHash('sha256').update(rawRefresh).digest('hex');
    await this.prisma.refreshToken.create({
      data: {
        tenantId: principal.tenantId,
        employeeId: principal.employeeId,
        tokenHash,
        familyId: randomUUID(),
        expiresAt: new Date(Date.now() + jwtCfg.refreshTtl * 1000),
      },
    });

    return { accessToken, refreshToken: rawRefresh };
  }

  /** Rotate a refresh token; detects reuse and revokes the family. */
  async refresh(rawRefresh: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = createHash('sha256').update(rawRefresh).digest('hex');
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    const invalid = new UnauthorizedException({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'הרשאת רענון אינה תקפה',
    });
    if (!stored || stored.expiresAt < new Date()) throw invalid;

    if (stored.revokedAt) {
      // Reuse detected — revoke the whole family.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw invalid;
    }

    const principal = await this.buildPrincipal(stored.employeeId, stored.tenantId);
    const jwtCfg = this.config.get('jwt', { infer: true });

    // Revoke the old token and issue a rotated one in the same family.
    const rawNext = randomUUID() + randomUUID();
    const nextHash = createHash('sha256').update(rawNext).digest('hex');
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          tenantId: stored.tenantId,
          employeeId: stored.employeeId,
          tokenHash: nextHash,
          familyId: stored.familyId,
          expiresAt: new Date(Date.now() + jwtCfg.refreshTtl * 1000),
        },
      }),
    ]);

    const accessToken = await this.jwt.signAsync(
      {
        sub: principal.employeeId,
        tenantId: principal.tenantId,
        roles: principal.roles,
        permissions: principal.permissions,
        branchIds: principal.branchIds,
      },
      { secret: jwtCfg.accessSecret, expiresIn: jwtCfg.accessTtl },
    );

    return { accessToken, refreshToken: rawNext };
  }

  async logout(rawRefresh: string | undefined): Promise<void> {
    if (!rawRefresh) return;
    const tokenHash = createHash('sha256').update(rawRefresh).digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(principal: AuthPrincipal): Promise<
    AuthPrincipal & { fullName: string; email: string; twoFactorEnabled: boolean }
  > {
    const employee = await this.prisma.employee.findUnique({
      where: { id: principal.employeeId },
      select: { fullName: true, email: true, twoFactorEnabled: true },
    });
    return {
      ...principal,
      fullName: employee?.fullName ?? '',
      email: employee?.email ?? '',
      twoFactorEnabled: employee?.twoFactorEnabled ?? false,
    };
  }

  /** Begin 2FA setup: store a pending secret and return the otpauth URI for a QR. */
  async twoFactorSetup(principal: AuthPrincipal): Promise<{ secret: string; otpauthUri: string }> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: principal.employeeId },
      select: { email: true },
    });
    const secret = generateBase32Secret();
    await this.prisma.employee.update({
      where: { id: principal.employeeId },
      data: { twoFactorSecret: secret, twoFactorEnabled: false },
    });
    return {
      secret,
      otpauthUri: otpauthUri(secret, employee?.email ?? 'user', 'Computer Room Manager'),
    };
  }

  /** Confirm the setup code and enable 2FA. */
  async twoFactorEnable(principal: AuthPrincipal, code: string): Promise<{ enabled: boolean }> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: principal.employeeId },
      select: { twoFactorSecret: true },
    });
    if (!employee?.twoFactorSecret) {
      throw new UnauthorizedException({ code: 'VALIDATION_FAILED', message: 'יש להתחיל הגדרת 2FA' });
    }
    if (!verifyTotp(employee.twoFactorSecret, code, Math.floor(Date.now() / 1000))) {
      throw new UnauthorizedException({ code: 'AUTH_INVALID_CREDENTIALS', message: 'קוד שגוי' });
    }
    await this.prisma.employee.update({
      where: { id: principal.employeeId },
      data: { twoFactorEnabled: true },
    });
    return { enabled: true };
  }

  async twoFactorDisable(principal: AuthPrincipal): Promise<{ enabled: boolean }> {
    await this.prisma.employee.update({
      where: { id: principal.employeeId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    return { enabled: false };
  }
}
