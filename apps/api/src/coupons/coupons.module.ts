import { Body, Controller, Get, Injectable, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { CouponDiscountType } from '@crm/database';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';

class CreateCouponDto {
  @ApiProperty({ example: 'WELCOME10' }) @IsString() @MinLength(1) code!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiProperty({ enum: CouponDiscountType }) @IsEnum(CouponDiscountType) discountType!: CouponDiscountType;
  @ApiProperty({ example: 10, description: 'אחוז / סכום קבוע (אגורות) / דקות בונוס' })
  @IsInt() @Min(0) discountValue!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() totalLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() minPurchaseMinor?: number;
}

/** Compute the money discount a coupon yields for a given subtotal. */
export function couponDiscount(
  coupon: { discountType: CouponDiscountType; discountValue: number; minPurchaseMinor: number | null },
  subtotalMinor: number,
): number {
  if (coupon.minPurchaseMinor && subtotalMinor < coupon.minPurchaseMinor) return 0;
  if (coupon.discountType === 'FIXED') return Math.min(coupon.discountValue, subtotalMinor);
  if (coupon.discountType === 'PERCENT')
    return Math.min(Math.round((subtotalMinor * coupon.discountValue) / 100), subtotalMinor);
  return 0; // BONUS_TIME / BONUS_PRINT are applied as balance credits, not money off
}

@Injectable()
class CouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthPrincipal) {
    return this.prisma.coupon.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { redemptions: true } } },
    });
  }

  async create(user: AuthPrincipal, dto: CreateCouponDto) {
    const coupon = await this.prisma.coupon.create({
      data: {
        tenantId: user.tenantId,
        code: dto.code.toUpperCase(),
        name: dto.name,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        totalLimit: dto.totalLimit,
        minPurchaseMinor: dto.minPurchaseMinor,
      },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'coupon.create', entity: 'Coupon', entityId: coupon.id, newValue: { code: coupon.code },
    });
    return coupon;
  }

  async validate(user: AuthPrincipal, code: string, subtotalMinor: number) {
    const coupon = await this.prisma.coupon.findFirst({
      where: { tenantId: user.tenantId, code: code.toUpperCase(), isActive: true },
      include: { _count: { select: { redemptions: true } } },
    });
    if (!coupon) return { valid: false, reason: 'קופון לא נמצא' };
    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) return { valid: false, reason: 'הקופון עדיין לא פעיל' };
    if (coupon.endsAt && coupon.endsAt < now) return { valid: false, reason: 'הקופון פג תוקף' };
    if (coupon.totalLimit && coupon._count.redemptions >= coupon.totalLimit)
      return { valid: false, reason: 'הקופון מוצה' };
    const discountMinor = couponDiscount(coupon, subtotalMinor);
    return { valid: true, discountMinor, discountType: coupon.discountType };
  }
}

@ApiTags('coupons')
@ApiBearerAuth()
@Controller('coupons')
class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COUPON_MANAGE)
  @ApiOperation({ summary: 'רשימת קופונים' })
  list(@CurrentUser() user: AuthPrincipal) {
    return this.coupons.list(user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COUPON_MANAGE)
  @ApiOperation({ summary: 'יצירת קופון' })
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateCouponDto) {
    return this.coupons.create(user, dto);
  }

  @Post('validate')
  @RequirePermissions(PERMISSIONS.SALE_CREATE)
  @ApiOperation({ summary: 'בדיקת קופון מול סכום' })
  validate(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: { code: string; subtotalMinor: number },
  ) {
    return this.coupons.validate(user, body.code, body.subtotalMinor ?? 0);
  }
}

@Module({
  controllers: [CouponsController],
  providers: [CouponsService],
})
export class CouponsModule {}
