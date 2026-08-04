import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';

class UpdateStorageDto {
  @ApiPropertyOptional({ example: 2048, description: 'מכסת אחסון (MB)' })
  @IsOptional() @IsInt() @Min(0) quotaMb?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}

/**
 * Per-customer personal storage metadata (quota/usage). Actual file I/O runs
 * through an object-storage adapter and is mapped by the Agent during a session;
 * this module manages the record and quota only. Cross-customer access is denied
 * by scoping every query to the tenant + customer.
 */
@Injectable()
class StorageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(user: AuthPrincipal, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId: user.tenantId, deletedAt: null },
      select: { id: true, storageEnabled: true },
    });
    if (!customer) throw new NotFoundException({ code: 'NOT_FOUND', message: 'לקוח לא נמצא' });
    const storage = await this.prisma.customerStorage.findUnique({ where: { customerId } });
    return { enabled: customer.storageEnabled, storage };
  }

  async update(user: AuthPrincipal, customerId: string, dto: UpdateStorageDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId: user.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException({ code: 'NOT_FOUND', message: 'לקוח לא נמצא' });

    const enabled = dto.enabled ?? true;
    const storage = await this.prisma.customerStorage.upsert({
      where: { customerId },
      create: { tenantId: user.tenantId, customerId, quotaMb: dto.quotaMb ?? 1024 },
      update: { ...(dto.quotaMb != null ? { quotaMb: dto.quotaMb } : {}) },
    });
    await this.prisma.customer.update({ where: { id: customerId }, data: { storageEnabled: enabled } });

    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'storage.update', entity: 'CustomerStorage', entityId: storage.id,
      newValue: { quotaMb: storage.quotaMb, enabled },
    });
    return { enabled, storage };
  }
}

@ApiTags('storage')
@ApiBearerAuth()
@Controller('customers/:customerId/storage')
class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'סטטוס אחסון אישי' })
  get(@CurrentUser() user: AuthPrincipal, @Param('customerId') customerId: string) {
    return this.storage.get(user, customerId);
  }

  @Put()
  @RequirePermissions(PERMISSIONS.CUSTOMER_UPDATE)
  @ApiOperation({ summary: 'עדכון/הפעלת אחסון אישי' })
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('customerId') customerId: string,
    @Body() dto: UpdateStorageDto,
  ) {
    return this.storage.update(user, customerId, dto);
  }
}

@Module({
  controllers: [StorageController],
  providers: [StorageService],
})
export class StorageModule {}
