import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './common/audit/audit.module';
import { AdaptersModule } from './common/adapters/adapters.module';
import { BalancesModule } from './balances/balances.module';
import { AuthModule } from './auth/auth.module';
import { BranchesModule } from './branches/branches.module';
import { CustomersModule } from './customers/customers.module';
import { ComputerGroupsModule } from './computer-groups/computer-groups.module';
import { ComputersModule } from './computers/computers.module';
import { RoomsModule } from './rooms/rooms.module';
import { SessionsModule } from './sessions/sessions.module';
import { AgentModule } from './agent/agent.module';
import { PosModule } from './pos/pos.module';
import { PaymentsModule } from './payments/payments.module';
import { CatalogModule } from './catalog/catalog.module';
import { PrintModule } from './print/print.module';
import { PrintersModule } from './printers/printers.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { ReservationsModule } from './reservations/reservations.module';
import { WaitingListModule } from './waiting-list/waiting-list.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { StorageModule } from './storage/storage.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DataModule } from './data/data.module';
import { KioskModule } from './kiosk/kiosk.module';
import { EmployeesModule } from './employees/employees.module';
import { SettingsModule } from './settings/settings.module';
import { CouponsModule } from './coupons/coupons.module';
import { JobsModule } from './jobs/jobs.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AuditReadModule } from './audit/audit.module';
import { RealtimeModule } from './realtime/realtime.module';
import { HealthController } from './health/health.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuditModule,
    AdaptersModule,
    BalancesModule,
    RealtimeModule,
    AuthModule,
    BranchesModule,
    CustomersModule,
    ComputerGroupsModule,
    ComputersModule,
    RoomsModule,
    SessionsModule,
    AgentModule,
    PosModule,
    PaymentsModule,
    CatalogModule,
    PrintModule,
    PrintersModule,
    MaintenanceModule,
    ReservationsModule,
    WaitingListModule,
    SubscriptionsModule,
    StorageModule,
    NotificationsModule,
    DataModule,
    KioskModule,
    EmployeesModule,
    SettingsModule,
    CouponsModule,
    JobsModule,
    ReportsModule,
    DashboardModule,
    AuditReadModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: authenticate, then rate-limit, then authorize.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
