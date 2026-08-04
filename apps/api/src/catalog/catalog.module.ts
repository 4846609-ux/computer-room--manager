import { Body, Controller, Get, Injectable, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { PackageType, Prisma } from '@crm/database';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';

class CreatePackageDto {
  @ApiProperty({ enum: PackageType }) @IsString() type!: PackageType;
  @ApiProperty({ example: '100 דקות' }) @IsString() @MinLength(1) name!: string;
  @ApiProperty({ type: Object, description: 'למשל { minutes: 100 } / { moneyValueMinor } / { bwPages }' })
  @IsObject() config!: Record<string, number>;
  @ApiProperty({ example: 2000, description: 'מחיר (אגורות)' }) @IsInt() @Min(0) priceMinor!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() validityDays?: number;
}

class CreateProductDto {
  @ApiProperty({ example: 'שתייה קרה' }) @IsString() @MinLength(1) name!: string;
  @ApiProperty({ example: 800 }) @IsInt() @Min(0) priceMinor!: number;
}

@Injectable()
class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listPackages(user: AuthPrincipal) {
    return this.prisma.package.findMany({
      where: { tenantId: user.tenantId, deletedAt: null, isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        prices: {
          where: { validTo: null },
          orderBy: { validFrom: 'desc' },
          take: 1,
        },
      },
    });
  }

  listProducts(user: AuthPrincipal) {
    return this.prisma.product.findMany({
      where: { tenantId: user.tenantId, deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createPackage(user: AuthPrincipal, dto: CreatePackageDto) {
    const pkg = await this.prisma.package.create({
      data: {
        tenantId: user.tenantId,
        type: dto.type,
        name: dto.name,
        config: dto.config as Prisma.InputJsonValue,
        validityDays: dto.validityDays,
        prices: { create: { tenantId: user.tenantId, priceMinor: dto.priceMinor } },
      },
      include: { prices: true },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'package.create', entity: 'Package', entityId: pkg.id, newValue: { name: dto.name },
    });
    return pkg;
  }

  async createProduct(user: AuthPrincipal, dto: CreateProductDto) {
    const product = await this.prisma.product.create({
      data: { tenantId: user.tenantId, name: dto.name, priceMinor: dto.priceMinor },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'product.create', entity: 'Product', entityId: product.id, newValue: { name: dto.name },
    });
    return product;
  }
}

@ApiTags('catalog')
@ApiBearerAuth()
@Controller()
class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('packages')
  @RequirePermissions(PERMISSIONS.PACKAGE_READ)
  @ApiOperation({ summary: 'רשימת חבילות' })
  listPackages(@CurrentUser() user: AuthPrincipal) {
    return this.catalog.listPackages(user);
  }

  @Post('packages')
  @RequirePermissions(PERMISSIONS.PACKAGE_MANAGE)
  @ApiOperation({ summary: 'יצירת חבילה' })
  createPackage(@CurrentUser() user: AuthPrincipal, @Body() dto: CreatePackageDto) {
    return this.catalog.createPackage(user, dto);
  }

  @Get('products')
  @RequirePermissions(PERMISSIONS.PACKAGE_READ)
  @ApiOperation({ summary: 'רשימת מוצרים' })
  listProducts(@CurrentUser() user: AuthPrincipal) {
    return this.catalog.listProducts(user);
  }

  @Post('products')
  @RequirePermissions(PERMISSIONS.PACKAGE_MANAGE)
  @ApiOperation({ summary: 'יצירת מוצר' })
  createProduct(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateProductDto) {
    return this.catalog.createProduct(user, dto);
  }
}

@Module({
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
