import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { PaymentMethod, PaymentStatus } from '@crm/database';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { SalesService } from '../pos/sales.service';
import { PosModule } from '../pos/pos.module';
import { SaleItemInput } from '../pos/dto/sale.dto';
import { SubscriptionsModule, SubscriptionsService } from '../subscriptions/subscriptions.module';
import { CurrentUser, Public, RequirePermissions } from '../common/decorators';
import { NedarimClient } from './nedarim.client';
import type { AppConfig } from '../config/configuration';

export enum NedarimPaymentType {
  REGULAR = 'REGULAR',
  STANDING_ORDER = 'STANDING_ORDER',
}

class PrepareDto {
  @ApiProperty() @IsString() branchId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerId?: string;
  @ApiProperty({ type: [SaleItemInput] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SaleItemInput)
  items!: SaleItemInput[];
  @ApiProperty({ enum: NedarimPaymentType })
  @IsEnum(NedarimPaymentType) paymentType!: NedarimPaymentType;
  @ApiPropertyOptional({ description: 'יום חיוב חודשי (הו"ק), 1-28' })
  @IsOptional() @IsString() day?: string;
}

// Nedarim Plus source IPs for CallBack verification.
const NEDARIM_IPS = ['18.196.146.117', '18.194.219.73'];

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sales: SalesService,
    private readonly subscriptions: SubscriptionsService,
    private readonly nedarim: NedarimClient,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Create an OPEN sale + a PENDING card payment, and return the exact field set the
   * browser must send to the Nedarim iframe in a FinishTransaction2 message. A unique
   * verification token travels as Param1 and is cross-checked in the callback.
   */
  async prepare(user: AuthPrincipal, dto: PrepareDto) {
    const c = this.config.get('nedarim', { infer: true });
    if (!c.mosadId || !c.apiValid) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'נדרים פלוס לא מוגדר (חסר Mosad/ApiValid)' });
    }

    // Reuse the standard sale pipeline (pricing, snapshots) with no immediate payment.
    const sale = await this.sales.createSale(user, {
      branchId: dto.branchId,
      customerId: dto.customerId,
      items: dto.items,
    });

    const token = randomUUID();
    const payment = await this.prisma.payment.create({
      data: {
        tenantId: user.tenantId,
        saleId: sale.id,
        method: PaymentMethod.CARD,
        status: PaymentStatus.PENDING,
        amountMinor: sale.totalMinor,
        reference: token,
      },
    });

    let customer: { fullName: string; phone: string | null; email: string | null; nationalId: string | null } | null =
      null;
    if (dto.customerId) {
      customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, tenantId: user.tenantId },
        select: { fullName: true, phone: true, email: true, nationalId: true },
      });
    }

    const amountShekels = (sale.totalMinor / 100).toString();
    const isHK = dto.paymentType === NedarimPaymentType.STANDING_ORDER;

    // Exact Nedarim FinishTransaction2 field names — the client spreads this into Value.
    const fields: Record<string, string> = {
      Mosad: c.mosadId,
      ApiValid: c.apiValid,
      PaymentType: isHK ? 'HK' : 'Ragil',
      Currency: '1',
      Zeout: customer?.nationalId ?? '',
      FirstName: customer?.fullName ?? '',
      LastName: '',
      Street: '',
      City: '',
      Phone: customer?.phone ?? '',
      Mail: customer?.email ?? '',
      Amount: amountShekels,
      Tashlumim: isHK ? '' : '1', // no installments per requirement
      Day: isHK ? (dto.day ?? '') : '',
      Groupe: 'Computer Room Manager',
      Comment: `Sale ${sale.id}`,
      Param1: token,
      Param2: sale.id,
      ForceUpdateMatching: '',
      ThirdPartyReceipt: '1', // we issue our own receipts
      CallBack: `${this.config.get('publicBaseUrl', { infer: true })}/api/v1/payments/nedarim/callback`,
      CallBackMailError: c.callbackMailError,
      Tokef: '',
    };

    return {
      iframeUrl: c.iframeUrl,
      fields,
      paymentId: payment.id,
      saleId: sale.id,
      amountMinor: sale.totalMinor,
    };
  }

  /** Authoritative settlement: Nedarim posts here (application/json) on success only. */
  async handleCallback(body: Record<string, unknown>, sourceIp: string | undefined) {
    if (sourceIp && !NEDARIM_IPS.some((ip) => sourceIp.includes(ip))) {
      // Not signed; the Param + amount cross-check below is the real protection.
      this.logger.warn(`Nedarim callback from unexpected IP: ${sourceIp}`);
    }

    const token = (body.Param1 as string) ?? '';
    const transactionId = (body.TransactionId as string) ?? (body.KevaId as string) ?? '';
    const amount = Number(body.Amount ?? 0);
    if (!token || !transactionId) {
      this.logger.warn('Nedarim callback missing Param1/TransactionId');
      return 'OK';
    }

    const payment = await this.prisma.payment.findFirst({
      where: { reference: token, status: PaymentStatus.PENDING },
      include: { sale: true },
    });
    if (!payment || !payment.saleId) {
      this.logger.warn(`Nedarim callback: no pending payment for token ${token}`);
      return 'OK';
    }

    // Cross-check the amount (shekels → agorot) matches what we expected.
    const expectedShekels = payment.amountMinor / 100;
    if (Math.abs(expectedShekels - amount) > 0.01) {
      this.logger.error(`Nedarim callback amount mismatch: expected ${expectedShekels}, got ${amount}`);
      return 'OK';
    }

    await this.sales.settle(payment.tenantId, 'system:nedarim', payment.saleId, {
      method: PaymentMethod.CARD,
      transactionId,
      cardLast4: (body.LastNum as string) ?? undefined,
      paymentId: payment.id,
    });

    // Standing order (הו"ק): Nedarim returns a KevaId and bills monthly itself.
    // Record a linked, externally-billed subscription (no internal charging).
    const kevaId = body.KevaId as string | undefined;
    if (kevaId && payment.sale?.customerId) {
      const items = await this.prisma.saleItem.findMany({ where: { saleId: payment.saleId } });
      for (const it of items) {
        if (it.referenceType === 'Package' && it.referenceId) {
          const pkg = await this.prisma.package.findFirst({
            where: { id: it.referenceId, tenantId: payment.tenantId, type: 'SUBSCRIPTION' },
          });
          if (pkg) {
            await this.subscriptions.createExternal({
              tenantId: payment.tenantId,
              customerId: payment.sale.customerId,
              packageId: pkg.id,
              externalRef: kevaId,
              priceMinor: payment.amountMinor,
            });
          }
        }
      }
    }

    await this.audit.record({
      tenantId: payment.tenantId, actorType: 'SYSTEM',
      action: 'payment.nedarim.callback', entity: 'Payment', entityId: payment.id,
      newValue: { transactionId, amount, kevaId },
    });
    return 'OK';
  }

  /** Client polls this after TransactionResponse:OK until the server confirms. */
  async status(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { status: true, saleId: true },
    });
    if (!payment) throw new NotFoundException({ code: 'NOT_FOUND', message: 'תשלום לא נמצא' });
    return { status: payment.status, saleId: payment.saleId };
  }

  /**
   * Dev-only shortcut to settle without a reachable callback (Nedarim's iframe/callback
   * do not work against localhost). Never enabled in production.
   */
  async devSettle(user: AuthPrincipal, paymentId: string, transactionId: string) {
    if (this.config.get('env', { infer: true }) === 'production') {
      throw new BadRequestException({ code: 'FORBIDDEN', message: 'לא זמין בפרודקשן' });
    }
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenantId: user.tenantId },
    });
    if (!payment?.saleId) throw new NotFoundException({ code: 'NOT_FOUND', message: 'תשלום לא נמצא' });
    await this.sales.settle(user.tenantId, user.employeeId, payment.saleId, {
      method: PaymentMethod.CARD,
      transactionId,
      paymentId: payment.id,
    });
    return this.status(paymentId);
  }

  async refund(user: AuthPrincipal, saleId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { tenantId: user.tenantId, saleId, method: PaymentMethod.CARD, status: PaymentStatus.COMPLETED },
    });
    if (!payment?.pspToken) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'לא נמצאה עסקת אשראי לזיכוי' });
    }
    const result = await this.nedarim.refund(payment.pspToken, payment.amountMinor / 100);
    if (!result.ok) {
      throw new BadRequestException({ code: 'INTERNAL', message: `זיכוי נכשל: ${result.message ?? ''}` });
    }
    await this.prisma.refund.create({
      data: {
        tenantId: user.tenantId,
        saleId,
        paymentId: payment.id,
        amountMinor: payment.amountMinor,
        reason: 'זיכוי דרך נדרים פלוס',
        createdById: user.employeeId,
      },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId,
      action: 'payment.nedarim.refund', entity: 'Payment', entityId: payment.id,
      newValue: { transactionId: payment.pspToken },
    });
    return { ok: true };
  }
}

@ApiTags('payments')
@Controller('payments/nedarim')
class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('prepare')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.PAYMENT_TAKE)
  @ApiOperation({ summary: 'הכנת עסקת נדרים פלוס (מחזיר שדות ל-iframe)' })
  prepare(@CurrentUser() user: AuthPrincipal, @Body() dto: PrepareDto) {
    return this.payments.prepare(user, dto);
  }

  @Public()
  @Post('callback')
  @ApiOperation({ summary: 'CallBack משרתי נדרים פלוס (אישור עסקה)' })
  callback(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) ?? req.ip;
    return this.payments.handleCallback(body, ip);
  }

  @Public()
  @Get('status/:paymentId')
  @ApiOperation({ summary: 'בדיקת סטטוס תשלום (polling)' })
  status(@Param('paymentId') paymentId: string) {
    return this.payments.status(paymentId);
  }

  @Post('dev-settle')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.PAYMENT_TAKE)
  @ApiOperation({ summary: 'סגירת עסקה ידנית (סביבת פיתוח בלבד)' })
  devSettle(@CurrentUser() user: AuthPrincipal, @Body() body: { paymentId: string; transactionId?: string }) {
    return this.payments.devSettle(user, body.paymentId, body.transactionId ?? `dev_${Date.now()}`);
  }

  @Post('refund/:saleId')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.REFUND_CREATE)
  @ApiOperation({ summary: 'זיכוי עסקת אשראי דרך נדרים פלוס' })
  refund(@CurrentUser() user: AuthPrincipal, @Param('saleId') saleId: string) {
    return this.payments.refund(user, saleId);
  }
}

@Module({
  imports: [PosModule, SubscriptionsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, NedarimClient],
  exports: [PaymentsService],
})
export class PaymentsModule {}
