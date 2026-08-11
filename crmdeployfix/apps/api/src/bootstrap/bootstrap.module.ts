import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import {
  ALL_PERMISSIONS,
  ROLE_KEYS,
  ROLE_PERMISSIONS,
  SYSTEM_ROLE_NAMES,
  type RoleKey,
} from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * First-run bootstrap: on an EMPTY database (no employees yet) this creates the
 * permission catalog, a tenant, the system roles, a main branch and an owner
 * login — so a freshly deployed server is immediately usable. Idempotent: once
 * any employee exists it does nothing, so it is safe to run on every boot.
 *
 * The owner credentials come from env vars (with safe defaults):
 *   OWNER_EMAIL (default owner@demo.crm), OWNER_PASSWORD (default Passw0rd!),
 *   ORG_NAME (default "העסק שלי").
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const existing = await this.prisma.employee.count();
      if (existing > 0) return;

      const email = (process.env.OWNER_EMAIL ?? 'owner@demo.crm').toLowerCase();
      const password = process.env.OWNER_PASSWORD ?? 'Passw0rd!';
      const orgName = process.env.ORG_NAME ?? 'העסק שלי';

      this.logger.log('Empty database detected — creating first owner account…');

      // 1. Permission catalog
      await this.prisma.$transaction(
        ALL_PERMISSIONS.map((key) =>
          this.prisma.permission.upsert({ where: { key }, update: {}, create: { key } }),
        ),
      );
      const permissions = await this.prisma.permission.findMany();
      const permByKey = new Map(permissions.map((p) => [p.key, p.id]));

      // 2. Tenant + settings
      const tenant = await this.prisma.tenant.upsert({
        where: { slug: 'main' },
        update: {},
        create: {
          name: orgName,
          slug: 'main',
          settings: {
            create: { currency: 'ILS', timezone: 'Asia/Jerusalem', defaultLanguage: 'he', vatPercent: 17 },
          },
        },
      });

      // 3. System roles + permissions
      const roleIdByKey = new Map<RoleKey, string>();
      for (const key of Object.values(ROLE_KEYS)) {
        const role = await this.prisma.role.upsert({
          where: { tenantId_key: { tenantId: tenant.id, key } },
          update: {},
          create: { tenantId: tenant.id, key, name: SYSTEM_ROLE_NAMES[key], isSystem: true },
        });
        roleIdByKey.set(key, role.id);
        await this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
        const perms = ROLE_PERMISSIONS[key]
          .map((pk) => permByKey.get(pk))
          .filter((id): id is string => Boolean(id));
        await this.prisma.rolePermission.createMany({
          data: perms.map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        });
      }

      // 4. Main branch
      await this.prisma.branch.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: 'MAIN' } },
        update: {},
        create: { tenantId: tenant.id, name: 'סניף ראשי', code: 'MAIN' },
      });

      // 5. Owner account
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      const owner = await this.prisma.employee.create({
        data: { tenantId: tenant.id, fullName: 'בעל העסק', email, passwordHash },
      });
      await this.prisma.userRole.create({
        data: {
          tenantId: tenant.id,
          employeeId: owner.id,
          roleId: roleIdByKey.get(ROLE_KEYS.OWNER)!,
          branchIds: [],
        },
      });

      this.logger.log(`✅ Owner account created: ${email}`);
    } catch (err) {
      this.logger.error(`Bootstrap failed (non-fatal): ${String(err)}`);
    }
  }
}

@Module({
  providers: [BootstrapService],
})
export class BootstrapModule {}
