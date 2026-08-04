import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Injectable,
  Module,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { randomInt } from 'node:crypto';
import { PaymentMethod, SessionBillingSource } from '@crm/database';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsModule } from '../sessions/sessions.module';
import { SessionsService } from '../sessions/sessions.service';
import { PosModule } from '../pos/pos.module';
import { SalesService } from '../pos/sales.service';
import { SaleItemKind } from '../pos/dto/sale.dto';
import { Public } from '../common/decorators';
import type { AppConfig } from '../config/configuration';

class OtpRequestDto {
  @ApiProperty({ example: 'demo' }) @IsString() tenantSlug!: string;
  @ApiProperty({ example: '050-0000000' }) @IsString() @MinLength(3) phone!: string;
}
class OtpVerifyDto {
  @ApiProperty() @IsString() tenantSlug!: string;
  @ApiProperty() @IsString() phone!: string;
  @ApiProperty({ example: '123456' }) @IsString() code!: string;
}
class KioskBuyDto {
  @ApiProperty() @IsString() packageId!: string;
}
class KioskOpenDto {
  @ApiProperty() @IsString() computerId!: string;
}

interface KioskToken {
  sub: string; // customerId
  tenantId: string;
  branchId: string;
  kind: 'kiosk';
}

/**
 * Self-service kiosk. Customers authenticate by phone + one-time code, then buy
 * packages, load balance and open a station — reusing the same server-side sale and
 * session logic (and its guards) as the staff console.
 */
@Injectable()
export class KioskService {
  // Dev OTP store (single-process). Production would use Redis + an SMS adapter.
  private readonly otps = new Map<string, { code: string; expires: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly sessions: SessionsService,
    private readonly sales: SalesService,
  ) {}

  private async resolveCustomer(tenantSlug: string, phone: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new BadRequestException({ code: 'NOT_FOUND', message: 'ארגון לא נמצא' });
    const customer = await this.prisma.customer.findFirst({
      where: { tenantId: tenant.id, phone, deletedAt: null, status: 'ACTIVE' },
    });
    return { tenant, customer };
  }

  async requestOtp(dto: OtpRequestDto) {
    const { tenant, customer } = await this.resolveCustomer(dto.tenantSlug, dto.phone);
    // Always respond the same way to avoid leaking which phones exist.
    if (!customer) return { sent: true };
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.otps.set(`${tenant.id}:${dto.phone}`, { code, expires: Date.now() + 5 * 60_000 });
    // In dev we return the code so the flow is testable without a real SMS gateway.
    const devCode = this.config.get('env', { infer: true }) !== 'production' ? code : undefined;
    return { sent: true, devCode };
  }

  async verifyOtp(dto: OtpVerifyDto) {
    const { tenant, customer } = await this.resolveCustomer(dto.tenantSlug, dto.phone);
    const key = `${tenant.id}:${dto.phone}`;
    const entry = this.otps.get(key);
    if (!customer || !entry || entry.expires < Date.now() || entry.code !== dto.code) {
      throw new UnauthorizedException({ code: 'AUTH_INVALID_CREDENTIALS', message: 'קוד שגוי או שפג תוקפו' });
    }
    this.otps.delete(key);

    const branchId =
      customer.primaryBranchId ??
      (await this.prisma.branch.findFirst({ where: { tenantId: tenant.id }, select: { id: true } }))?.id ??
      '';

    const token = await this.jwt.signAsync(
      { sub: customer.id, tenantId: tenant.id, branchId, kind: 'kiosk' } satisfies KioskToken,
      { secret: this.config.get('jwt', { infer: true }).accessSecret, expiresIn: 1800 },
    );
    return { token, customer: { id: customer.id, fullName: customer.fullName } };
  }

  private async auth(token: string | undefined): Promise<KioskToken> {
    if (!token) throw new UnauthorizedException({ code: 'FORBIDDEN', message: 'נדרשת התחברות' });
    try {
      const payload = await this.jwt.verifyAsync<KioskToken>(token, {
        secret: this.config.get('jwt', { infer: true }).accessSecret,
      });
      if (payload.kind !== 'kiosk') throw new Error('wrong kind');
      return payload;
    } catch {
      throw new UnauthorizedException({ code: 'FORBIDDEN', message: 'התחברות פגה' });
    }
  }

  /** Build a synthetic principal scoped to this customer's branch for reuse of
   *  the staff services (which enforce the same guards). */
  private principal(k: KioskToken, permission: string): AuthPrincipal {
    return {
      employeeId: `kiosk:${k.sub}`,
      tenantId: k.tenantId,
      roles: ['KIOSK'],
      permissions: [permission],
      branchIds: [k.branchId],
    };
  }

  async me(token: string | undefined) {
    const k = await this.auth(token);
    const customer = await this.prisma.customer.findFirst({
      where: { id: k.sub, tenantId: k.tenantId },
      include: { balance: true },
    });
    return {
      fullName: customer?.fullName,
      balance: customer?.balance,
    };
  }

  async packages(token: string | undefined) {
    const k = await this.auth(token);
    return this.prisma.package.findMany({
      where: { tenantId: k.tenantId, deletedAt: null, isActive: true },
      include: { prices: { where: { validTo: null }, orderBy: { validFrom: 'desc' }, take: 1 } },
    });
  }

  async availableComputers(token: string | undefined) {
    const k = await this.auth(token);
    return this.prisma.computer.findMany({
      where: { tenantId: k.tenantId, branchId: k.branchId, status: 'AVAILABLE', deletedAt: null },
      select: { id: true, name: true, stationNumber: true },
      orderBy: { stationNumber: 'asc' },
    });
  }

  async buy(token: string | undefined, dto: KioskBuyDto) {
    const k = await this.auth(token);
    // The kiosk settles the package price via self-service payment (card at kiosk).
    const pkg = await this.prisma.package.findFirst({
      where: { id: dto.packageId, tenantId: k.tenantId, deletedAt: null, isActive: true },
      include: { prices: { where: { validTo: null }, orderBy: { validFrom: 'desc' }, take: 1 } },
    });
    if (!pkg) throw new BadRequestException({ code: 'NOT_FOUND', message: 'חבילה לא נמצאה' });
    const price = pkg.prices[0]?.priceMinor ?? 0;

    return this.sales.createSale(this.principal(k, PERMISSIONS.SALE_CREATE), {
      branchId: k.branchId,
      customerId: k.sub,
      items: [{ kind: SaleItemKind.PACKAGE, refId: dto.packageId }],
      payment: { method: PaymentMethod.SELF_SERVICE, amountMinor: price },
    });
  }

  async openStation(token: string | undefined, dto: KioskOpenDto) {
    const k = await this.auth(token);
    return this.sessions.open(this.principal(k, PERMISSIONS.SESSION_OPEN), {
      computerId: dto.computerId,
      customerId: k.sub,
      billingSource: SessionBillingSource.MONEY_BALANCE,
    });
  }
}

@ApiTags('kiosk')
@Controller('kiosk')
class KioskController {
  constructor(private readonly kiosk: KioskService) {}

  @Public() @Post('otp/request') @ApiOperation({ summary: 'בקשת קוד חד-פעמי' })
  requestOtp(@Body() dto: OtpRequestDto) {
    return this.kiosk.requestOtp(dto);
  }

  @Public() @Post('otp/verify') @ApiOperation({ summary: 'אימות קוד וכניסה' })
  verifyOtp(@Body() dto: OtpVerifyDto) {
    return this.kiosk.verifyOtp(dto);
  }

  @Public() @Get('me') @ApiOperation({ summary: 'יתרת הלקוח' })
  me(@Headers('x-kiosk-token') token?: string) {
    return this.kiosk.me(token);
  }

  @Public() @Get('packages') @ApiOperation({ summary: 'חבילות לרכישה' })
  packages(@Headers('x-kiosk-token') token?: string) {
    return this.kiosk.packages(token);
  }

  @Public() @Get('computers') @ApiOperation({ summary: 'עמדות פנויות' })
  computers(@Headers('x-kiosk-token') token?: string) {
    return this.kiosk.availableComputers(token);
  }

  @Public() @Post('buy') @ApiOperation({ summary: 'רכישת חבילה' })
  buy(@Body() dto: KioskBuyDto, @Headers('x-kiosk-token') token?: string) {
    return this.kiosk.buy(token, dto);
  }

  @Public() @Post('open') @ApiOperation({ summary: 'פתיחת עמדה' })
  open(@Body() dto: KioskOpenDto, @Headers('x-kiosk-token') token?: string) {
    return this.kiosk.openStation(token, dto);
  }
}

@Module({
  imports: [JwtModule.register({}), SessionsModule, PosModule],
  controllers: [KioskController],
  providers: [KioskService],
})
export class KioskModule {}
