/**
 * Seed data for local development. Creates the permission catalog, a demo tenant
 * with system roles, an owner + cashier employee, a branch, a computer group with
 * computers, customer groups, a demo customer with balance, packages and products.
 *
 * Passwords are hashed with Argon2id, matching the API's auth module.
 *
 * Run: pnpm --filter @crm/database seed
 */
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  ROLE_KEYS,
  ROLE_PERMISSIONS,
  SYSTEM_ROLE_NAMES,
  type RoleKey,
} from '@crm/shared';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Passw0rd!';

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Permission catalog (global)
  await prisma.$transaction(
    ALL_PERMISSIONS.map((key) =>
      prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key },
      }),
    ),
  );
  const permissions = await prisma.permission.findMany();
  const permByKey = new Map(permissions.map((p) => [p.key, p.id]));

  // 2. Tenant + settings
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'רשת חדרי מחשבים לדוגמה',
      slug: 'demo',
      settings: {
        create: {
          currency: 'ILS',
          timezone: 'Asia/Jerusalem',
          defaultLanguage: 'he',
          vatPercent: 17,
        },
      },
    },
  });

  // 3. System roles + role permissions
  const roleIdByKey = new Map<RoleKey, string>();
  for (const key of Object.values(ROLE_KEYS)) {
    const role = await prisma.role.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key } },
      update: {},
      create: {
        tenantId: tenant.id,
        key,
        name: SYSTEM_ROLE_NAMES[key],
        isSystem: true,
      },
    });
    roleIdByKey.set(key, role.id);

    // (re)assign permissions for the role
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const perms = ROLE_PERMISSIONS[key]
      .map((pk) => permByKey.get(pk))
      .filter((id): id is string => Boolean(id));
    await prisma.rolePermission.createMany({
      data: perms.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }

  // 4. Branch
  const branch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'MAIN' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'סניף ראשי - תל אביב',
      code: 'MAIN',
      address: 'רחוב הרצל 1, תל אביב',
      phone: '03-0000000',
      email: 'main@demo.crm',
    },
  });

  // 5. Employees (owner + cashier)
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });

  const owner = await prisma.employee.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'owner@demo.crm' } },
    update: {},
    create: {
      tenantId: tenant.id,
      fullName: 'בעל העסק',
      email: 'owner@demo.crm',
      passwordHash,
    },
  });
  await prisma.userRole.upsert({
    where: {
      tenantId_employeeId_roleId: {
        tenantId: tenant.id,
        employeeId: owner.id,
        roleId: roleIdByKey.get(ROLE_KEYS.OWNER)!,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      employeeId: owner.id,
      roleId: roleIdByKey.get(ROLE_KEYS.OWNER)!,
      branchIds: [],
    },
  });

  const cashier = await prisma.employee.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'cashier@demo.crm' } },
    update: {},
    create: {
      tenantId: tenant.id,
      fullName: 'עובד קופה',
      email: 'cashier@demo.crm',
      passwordHash,
      cashCode: '1001',
    },
  });
  await prisma.userRole.upsert({
    where: {
      tenantId_employeeId_roleId: {
        tenantId: tenant.id,
        employeeId: cashier.id,
        roleId: roleIdByKey.get(ROLE_KEYS.CASHIER)!,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      employeeId: cashier.id,
      roleId: roleIdByKey.get(ROLE_KEYS.CASHIER)!,
      branchIds: [branch.id],
    },
  });

  await prisma.branch.update({ where: { id: branch.id }, data: { managerId: owner.id } });

  // 6. Room + computer group + computers
  const room = await prisma.room.create({
    data: { tenantId: tenant.id, branchId: branch.id, name: 'אולם ראשי', floor: '1' },
  });

  const group = await prisma.computerGroup.create({
    data: {
      tenantId: tenant.id,
      branchId: branch.id,
      name: 'מחשבים רגילים',
      billingRatio: 1.0,
      pricePerMinuteMinor: 20, // 0.20 NIS/min => 12 NIS/hour
      pricePerHourMinor: 1200,
      minChargeMinor: 500,
      minMinutes: 10,
      restartOnEnd: true,
      cleanupPolicy: { downloads: true, desktop: true, browserHistory: true, localProfile: false },
    },
  });

  const premiumGroup = await prisma.computerGroup.create({
    data: {
      tenantId: tenant.id,
      branchId: branch.id,
      name: 'מחשבים מתקדמים',
      billingRatio: 2.0,
      pricePerMinuteMinor: 20,
      pricePerHourMinor: 1200,
      minChargeMinor: 800,
      minMinutes: 10,
    },
  });

  for (let i = 1; i <= 6; i++) {
    await prisma.computer.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        roomId: room.id,
        groupId: i <= 4 ? group.id : premiumGroup.id,
        systemId: `DEMO-PC-${String(i).padStart(3, '0')}`,
        name: `עמדה ${i}`,
        stationNumber: String(i),
        status: 'DISCONNECTED',
        deviceType: 'WINDOWS_PC',
      },
    });
  }

  // 7. Customer group + demo customer with balance
  const custGroup = await prisma.customerGroup.create({
    data: { tenantId: tenant.id, name: 'לקוח רגיל', discountPercent: 0 },
  });

  const settings = await prisma.organizationSettings.findUnique({ where: { tenantId: tenant.id } });
  const nextNumber = (settings?.customerNumberSeq ?? 1000) + 1;

  const customer = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      customerNumber: nextNumber,
      fullName: 'ישראל ישראלי',
      phone: '050-0000000',
      email: 'customer@demo.crm',
      groupId: custGroup.id,
      primaryBranchId: branch.id,
      balance: {
        create: {
          tenantId: tenant.id,
          moneyMinor: 5000,
          timeSecondsRemaining: 6000,
          printBwRemaining: 50,
        },
      },
    },
    include: { balance: true },
  });
  await prisma.organizationSettings.update({
    where: { tenantId: tenant.id },
    data: { customerNumberSeq: nextNumber },
  });

  // Opening ledger entries reflecting the seeded balance
  await prisma.customerBalanceTransaction.createMany({
    data: [
      {
        tenantId: tenant.id,
        customerId: customer.id,
        kind: 'LOAD',
        unit: 'MONEY',
        amount: 5000,
        balanceAfter: 5000,
        reason: 'טעינת פתיחה (seed)',
      },
      {
        tenantId: tenant.id,
        customerId: customer.id,
        kind: 'PACKAGE',
        unit: 'TIME_SECONDS',
        amount: 6000,
        balanceAfter: 6000,
        reason: 'חבילת זמן פתיחה (seed)',
      },
    ],
  });

  // 8. Packages + products
  await prisma.package.create({
    data: {
      tenantId: tenant.id,
      type: 'TIME',
      name: '100 דקות',
      config: { minutes: 100 },
      validityDays: 90,
      prices: { create: { tenantId: tenant.id, priceMinor: 2000 } },
    },
  });
  await prisma.package.create({
    data: {
      tenantId: tenant.id,
      type: 'PRINT',
      name: 'חבילת 100 הדפסות שחור-לבן',
      config: { bwPages: 100, colorPages: 0 },
      prices: { create: { tenantId: tenant.id, priceMinor: 3000 } },
    },
  });
  await prisma.product.create({
    data: { tenantId: tenant.id, name: 'שתייה קרה', priceMinor: 800 },
  });

  // 9. Cash register (for POS shifts)
  await prisma.cashRegister.create({
    data: { tenantId: tenant.id, branchId: branch.id, name: 'קופה ראשית' },
  });

  console.log('✅ Seed complete.');
  console.log(`   Owner login:   owner@demo.crm / ${DEMO_PASSWORD}`);
  console.log(`   Cashier login: cashier@demo.crm / ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
