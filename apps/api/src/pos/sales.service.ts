import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceType, Prisma, PackageType, PaymentStatus, SaleStatus } from '@crm/database';
import { formatMoney, PERMISSIONS, WS_EVENTS, type AuthPrincipal } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { BalanceService } from '../balances/balance.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { assertBranchScope } from '../common/scope';
import { CreateSaleDto, RefundDto, SaleItemInput, SaleItemKind } from './dto/sale.dto';

interface ResolvedItem {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
  referenceType?: string;
  referenceId?: string;
  packageType?: PackageType;
  packageConfig?: Record<string, number>;
  packageBonus?: Record<string, number>;
  pricingSnapshot?: Prisma.InputJsonValue;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly balances: BalanceService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Resolve each requested item to a priced line, capturing a price snapshot. */
  private async resolveItem(tenantId: string, input: SaleItemInput): Promise<ResolvedItem> {
    const quantity = input.quantity ?? 1;

    if (input.kind === SaleItemKind.PRODUCT) {
      if (!input.refId) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'חסר מזהה מוצר' });
      const product = await this.prisma.product.findFirst({
        where: { id: input.refId, tenantId, deletedAt: null, isActive: true },
      });
      if (!product) throw new NotFoundException({ code: 'NOT_FOUND', message: 'מוצר לא נמצא' });
      return {
        description: product.name,
        quantity,
        unitPriceMinor: product.priceMinor,
        totalMinor: product.priceMinor * quantity,
        referenceType: 'Product',
        referenceId: product.id,
        pricingSnapshot: { priceMinor: product.priceMinor },
      };
    }

    if (input.kind === SaleItemKind.PACKAGE) {
      if (!input.refId) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'חסר מזהה חבילה' });
      const pkg = await this.prisma.package.findFirst({
        where: { id: input.refId, tenantId, deletedAt: null, isActive: true },
        include: {
          prices: {
            where: { validFrom: { lte: new Date() }, OR: [{ validTo: null }, { validTo: { gt: new Date() } }] },
            orderBy: { validFrom: 'desc' },
            take: 1,
          },
        },
      });
      if (!pkg) throw new NotFoundException({ code: 'NOT_FOUND', message: 'חבילה לא נמצאה' });
      const priceRow = pkg.prices[0];
      if (!priceRow) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'לחבילה אין מחיר פעיל' });

      const now = new Date();
      const inPromo =
        priceRow.promoMinor != null &&
        (!priceRow.promoFrom || priceRow.promoFrom <= now) &&
        (!priceRow.promoTo || priceRow.promoTo > now);
      const unit = inPromo ? priceRow.promoMinor! : priceRow.priceMinor;

      return {
        description: pkg.name,
        quantity,
        unitPriceMinor: unit,
        totalMinor: unit * quantity,
        referenceType: 'Package',
        referenceId: pkg.id,
        packageType: pkg.type,
        packageConfig: (pkg.config as Record<string, number>) ?? {},
        packageBonus: (pkg.bonus as Record<string, number>) ?? {},
        pricingSnapshot: { unitPriceMinor: unit, packagePriceId: priceRow.id, promo: inPromo },
      };
    }

    // CUSTOM
    if (input.unitPriceMinor == null || !input.description) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'פריט חופשי דורש תיאור ומחיר' });
    }
    return {
      description: input.description,
      quantity,
      unitPriceMinor: input.unitPriceMinor,
      totalMinor: input.unitPriceMinor * quantity,
    };
  }

  /** Apply a purchased package's value to the customer's balance via the ledger. */
  private async applyPackage(
    tx: Prisma.TransactionClient,
    user: AuthPrincipal,
    customerId: string,
    item: ResolvedItem,
    saleId: string,
  ): Promise<void> {
    const cfg = item.packageConfig ?? {};
    const bonus = item.packageBonus ?? {};
    const credits: Array<{ unit: 'MONEY' | 'TIME_SECONDS' | 'PRINT_BW' | 'PRINT_COLOR'; amount: number }> = [];

    switch (item.packageType) {
      case PackageType.TIME:
        credits.push({ unit: 'TIME_SECONDS', amount: ((cfg.minutes ?? 0) + (bonus.time ?? 0)) * 60 });
        break;
      case PackageType.MONEY_VALUE:
        credits.push({ unit: 'MONEY', amount: (cfg.moneyValueMinor ?? 0) + (bonus.money ?? 0) });
        break;
      case PackageType.PRINT:
        if (cfg.bwPages) credits.push({ unit: 'PRINT_BW', amount: cfg.bwPages });
        if (cfg.colorPages) credits.push({ unit: 'PRINT_COLOR', amount: cfg.colorPages });
        break;
      default:
        break; // SUBSCRIPTION / PUNCH_CARD handled elsewhere
    }

    for (const credit of credits) {
      await this.balances.applyWithin(tx, {
        tenantId: user.tenantId,
        customerId,
        unit: credit.unit,
        amount: credit.amount,
        kind: 'PACKAGE',
        reason: `רכישת חבילה: ${item.description}`,
        referenceType: 'Sale',
        referenceId: saleId,
        createdById: user.employeeId,
      });
    }

    await tx.customerPackage.create({
      data: {
        tenantId: user.tenantId,
        customerId,
        packageId: item.referenceId!,
        remainingTime: credits.find((c) => c.unit === 'TIME_SECONDS')?.amount ?? 0,
        remainingMoney: credits.find((c) => c.unit === 'MONEY')?.amount ?? 0,
        remainingBw: credits.find((c) => c.unit === 'PRINT_BW')?.amount ?? 0,
        remainingColor: credits.find((c) => c.unit === 'PRINT_COLOR')?.amount ?? 0,
        purchasePriceMinor: item.totalMinor,
        pricingSnapshot: item.pricingSnapshot ?? {},
      },
    });
  }

  /**
   * Create a sale (optionally with immediate payment). Payments carry an
   * Idempotency-Key so a duplicated request never double-charges (spec scenario 7).
   */
  async createSale(user: AuthPrincipal, dto: CreateSaleDto, idempotencyKey?: string) {
    assertBranchScope(user, dto.branchId);

    // Idempotency: a repeated payment key returns the original sale.
    if (idempotencyKey) {
      const existing = await this.prisma.payment.findFirst({
        where: { tenantId: user.tenantId, idempotencyKey },
        include: { sale: true },
      });
      if (existing?.sale) return existing.sale;
    }

    const resolved = await Promise.all(dto.items.map((i) => this.resolveItem(user.tenantId, i)));
    const hasPackage = resolved.some((r) => r.referenceType === 'Package');
    if (hasPackage && !dto.customerId) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'רכישת חבילה מחייבת בחירת לקוח' });
    }

    const subtotal = resolved.reduce((sum, r) => sum + r.totalMinor, 0);
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { tenantId: user.tenantId },
      select: { vatPercent: true },
    });
    const vat = settings?.vatPercent ?? 17;
    // Prices are tax-inclusive; compute the embedded VAT component for the document.
    const taxMinor = Math.round(subtotal - subtotal / (1 + vat / 100));

    const paid = dto.payment?.amountMinor ?? 0;
    if (dto.payment && paid < subtotal) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'התשלום נמוך מסכום המכירה' });
    }

    const sale = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          tenantId: user.tenantId,
          branchId: dto.branchId,
          customerId: dto.customerId,
          cashShiftId: dto.cashShiftId,
          employeeId: user.employeeId,
          status: dto.payment ? SaleStatus.COMPLETED : SaleStatus.OPEN,
          subtotalMinor: subtotal,
          taxMinor,
          totalMinor: subtotal,
          items: {
            create: resolved.map((r) => ({
              tenantId: user.tenantId,
              productId: r.referenceType === 'Product' ? r.referenceId : undefined,
              description: r.description,
              quantity: r.quantity,
              unitPriceMinor: r.unitPriceMinor,
              totalMinor: r.totalMinor,
              pricingSnapshot: r.pricingSnapshot,
              referenceType: r.referenceType,
              referenceId: r.referenceId,
            })),
          },
        },
      });

      if (dto.payment) {
        await tx.payment.create({
          data: {
            tenantId: user.tenantId,
            saleId: created.id,
            method: dto.payment.method,
            status: PaymentStatus.COMPLETED,
            amountMinor: dto.payment.amountMinor,
            idempotencyKey,
          },
        });

        // Apply package effects only once the sale is paid.
        if (dto.customerId) {
          for (const item of resolved) {
            if (item.referenceType === 'Package') {
              await this.applyPackage(tx, user, dto.customerId, item, created.id);
            }
          }
        }
      }

      return created;
    });

    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: dto.branchId,
      action: 'sale.create', entity: 'Sale', entityId: sale.id,
      newValue: { totalMinor: subtotal, paid, items: resolved.length },
    });
    if (dto.payment) {
      this.realtime.emitToBranch(WS_EVENTS.PAYMENT_COMPLETED, user.tenantId, dto.branchId, {
        saleId: sale.id,
        amountMinor: paid,
      });
    }
    return sale;
  }

  async listSales(user: AuthPrincipal, branchId?: string) {
    const sales = await this.prisma.sale.findMany({
      where: {
        tenantId: user.tenantId,
        ...(user.branchIds.length > 0 ? { branchId: { in: user.branchIds } } : {}),
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { items: true, payments: true, customer: { select: { fullName: true } } },
    });
    return sales;
  }

  /** Reverse a sale via a credit note + refund record (money is never deleted). */
  async refund(user: AuthPrincipal, saleId: string, dto: RefundDto) {
    if (!user.permissions.includes(PERMISSIONS.REFUND_CREATE)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'אין הרשאה לביצוע החזר' });
    }
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, tenantId: user.tenantId },
      include: { payments: true },
    });
    if (!sale) throw new NotFoundException({ code: 'NOT_FOUND', message: 'עסקה לא נמצאה' });
    assertBranchScope(user, sale.branchId);

    const paidTotal = sale.payments
      .filter((p) => p.status === 'COMPLETED')
      .reduce((s, p) => s + p.amountMinor, 0);
    if (dto.amountMinor > paidTotal) {
      throw new ConflictException({ code: 'VALIDATION_FAILED', message: 'סכום ההחזר עולה על ששולם' });
    }

    const refund = await this.prisma.refund.create({
      data: {
        tenantId: user.tenantId,
        saleId,
        amountMinor: dto.amountMinor,
        reason: dto.reason,
        createdById: user.employeeId,
      },
    });
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: sale.branchId,
      action: 'refund.create', entity: 'Sale', entityId: saleId,
      reason: dto.reason, newValue: { amountMinor: dto.amountMinor },
    });
    return refund;
  }

  /** Issue a numbered fiscal document for a sale (per-tenant sequence). */
  async issueInvoice(user: AuthPrincipal, saleId: string, type: InvoiceType) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, tenantId: user.tenantId },
    });
    if (!sale) throw new NotFoundException({ code: 'NOT_FOUND', message: 'עסקה לא נמצאה' });
    assertBranchScope(user, sale.branchId);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const settings = await tx.organizationSettings.update({
        where: { tenantId: user.tenantId },
        data: { invoiceNumberSeq: { increment: 1 } },
        select: { invoiceNumberSeq: true },
      });
      const number = String(settings.invoiceNumberSeq).padStart(6, '0');
      return tx.invoice.create({
        data: {
          tenantId: user.tenantId,
          saleId,
          branchId: sale.branchId,
          type,
          number,
          totalMinor: sale.totalMinor,
          taxMinor: sale.taxMinor,
        },
      });
    });

    await this.audit.record({
      tenantId: user.tenantId, actorId: user.employeeId, branchId: sale.branchId,
      action: 'invoice.issue', entity: 'Invoice', entityId: invoice.id,
      newValue: { type, number: invoice.number },
    });
    return invoice;
  }

  /** Printable HTML receipt (browser print-to-PDF). Contains no card data. */
  async receiptHtml(user: AuthPrincipal, saleId: string): Promise<string> {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, tenantId: user.tenantId },
      include: {
        items: true,
        payments: true,
        branch: { select: { name: true, address: true, taxId: true } },
        customer: { select: { fullName: true, customerNumber: true } },
        invoices: { orderBy: { issuedAt: 'desc' }, take: 1 },
      },
    });
    if (!sale) throw new NotFoundException({ code: 'NOT_FOUND', message: 'עסקה לא נמצאה' });
    assertBranchScope(user, sale.branchId);

    const rows = sale.items
      .map(
        (i) =>
          `<tr><td>${escapeHtml(i.description)}</td><td class="c">${i.quantity}</td><td class="e">${formatMoney(i.totalMinor)}</td></tr>`,
      )
      .join('');
    const paid = sale.payments
      .filter((p) => p.status === 'COMPLETED')
      .reduce((s, p) => s + p.amountMinor, 0);
    const invoice = sale.invoices[0];
    const dateStr = new Date(sale.createdAt).toLocaleString('he-IL');

    return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>קבלה ${invoice?.number ?? ''}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:24px auto;color:#111}
  h1{font-size:20px;margin:0 0 4px}
  .muted{color:#666;font-size:12px}
  table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}
  th,td{padding:6px 4px;border-bottom:1px solid #eee;text-align:right}
  td.c{text-align:center}td.e{text-align:left}
  .total{font-weight:bold;font-size:16px;border-top:2px solid #111}
  .foot{margin-top:16px;font-size:12px;color:#666;text-align:center}
  @media print{button{display:none}}
</style></head>
<body>
  <h1>${escapeHtml(sale.branch?.name ?? 'קבלה')}</h1>
  <div class="muted">${escapeHtml(sale.branch?.address ?? '')}${sale.branch?.taxId ? ` · ע.מ ${escapeHtml(sale.branch.taxId)}` : ''}</div>
  <div class="muted">${invoice ? `מסמך ${docTypeLabel(invoice.type)} · מס׳ ${invoice.number}` : 'קבלה זמנית'} · ${dateStr}</div>
  ${sale.customer ? `<div class="muted">לקוח: ${escapeHtml(sale.customer.fullName)} (#${sale.customer.customerNumber})</div>` : ''}
  <table>
    <thead><tr><th>פריט</th><th class="c">כמות</th><th class="e">סכום</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr><td colspan="2">מזה מע"מ</td><td class="e">${formatMoney(sale.taxMinor)}</td></tr>
      <tr class="total"><td colspan="2">סה"כ לתשלום</td><td class="e">${formatMoney(sale.totalMinor)}</td></tr>
      <tr><td colspan="2">שולם</td><td class="e">${formatMoney(paid)}</td></tr>
    </tfoot>
  </table>
  <div class="foot">תודה ולהתראות · Computer Room Manager</div>
  <div style="text-align:center;margin-top:12px"><button onclick="window.print()">הדפסה / שמירה כ-PDF</button></div>
</body></html>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

function docTypeLabel(type: InvoiceType): string {
  const map: Record<InvoiceType, string> = {
    RECEIPT: 'קבלה',
    TAX_INVOICE: 'חשבונית מס',
    TAX_INVOICE_RECEIPT: 'חשבונית מס-קבלה',
    CREDIT_NOTE: 'זיכוי',
  };
  return map[type];
}
