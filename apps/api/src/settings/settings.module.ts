import { Body, Controller, Get, Injectable, Module, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Prisma } from '@crm/database';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';

class UpdateOrgSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactEmail?: string;
  @ApiPropertyOptional({ example: 'ILS' }) @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional({ example: 'Asia/Jerusalem' }) @IsOptional() @IsString() timezone?: string;
  @ApiPropertyOptional({ example: 'he' }) @IsOptional() @IsString() defaultLanguage?: string;
  @ApiPropertyOptional({ example: 17 }) @IsOptional() @IsInt() @Min(0) @Max(100) vatPercent?: number;
  @ApiPropertyOptional({ example: 'UP' }) @IsOptional() @IsString() roundingRule?: string;
  @ApiPropertyOptional({ example: 30 }) @IsOptional() @IsInt() @Min(1) sessionTimeoutMin?: number;
  @ApiPropertyOptional({ example: 365 }) @IsOptional() @IsInt() @Min(1) retentionDays?: number;

  // Kiosk / self-service behavior
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requireCustomerName?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requireCustomerEmail?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoDisconnectEnabled?: boolean;
  @ApiPropertyOptional({ example: 3 }) @IsOptional() @IsInt() @Min(1) @Max(240) autoDisconnectMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() machineUnlockCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() receiptEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultCustomerGroupId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() kioskBackgroundUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() kioskAdBackgroundUrl?: string;
}

@Injectable()
class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getOrg(user: AuthPrincipal) {
    return this.prisma.organizationSettings.findUnique({ where: { tenantId: user.tenantId } });
  }

  async updateOrg(user: AuthPrincipal, dto: UpdateOrgSettingsDto) {
    const before = await this.prisma.organizationSettings.findUnique({
      where: { tenantId: user.tenantId },
    });
    const settings = await this.prisma.organizationSettings.update({
      where: { tenantId: user.tenantId },
      data: dto as Prisma.OrganizationSettingsUpdateInput,
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'settings.org.update', entity: 'OrganizationSettings', entityId: settings.id,
      previousValue: before ? { vatPercent: before.vatPercent, currency: before.currency } : undefined,
      newValue: dto,
    });
    return settings;
  }
}

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('org')
  @RequirePermissions(PERMISSIONS.SETTINGS_ORG)
  @ApiOperation({ summary: 'הגדרות ארגון' })
  getOrg(@CurrentUser() user: AuthPrincipal) {
    return this.settings.getOrg(user);
  }

  @Patch('org')
  @RequirePermissions(PERMISSIONS.SETTINGS_ORG)
  @ApiOperation({ summary: 'עדכון הגדרות ארגון' })
  updateOrg(@CurrentUser() user: AuthPrincipal, @Body() dto: UpdateOrgSettingsDto) {
    return this.settings.updateOrg(user, dto);
  }
}

@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
