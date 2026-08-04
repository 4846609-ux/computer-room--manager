import { Body, Controller, Get, Header, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InvoiceType } from '@crm/database';
import { PERMISSIONS, type AuthPrincipal } from '@crm/shared';
import { SalesService } from './sales.service';
import { CashService } from './cash.service';
import { CreateSaleDto, RefundDto } from './dto/sale.dto';
import { CashMovementDto, CloseShiftDto, OpenShiftDto } from './dto/cash.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';

@ApiTags('pos')
@ApiBearerAuth()
@Controller('pos')
export class PosController {
  constructor(
    private readonly sales: SalesService,
    private readonly cash: CashService,
  ) {}

  @Post('sales')
  @RequirePermissions(PERMISSIONS.SALE_CREATE)
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'מפתח למניעת חיוב כפול' })
  @ApiOperation({ summary: 'מכירה חדשה (עם תשלום אופציונלי)' })
  createSale(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: CreateSaleDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.sales.createSale(user, dto, idempotencyKey);
  }

  @Get('sales')
  @RequirePermissions(PERMISSIONS.SALE_READ)
  @ApiOperation({ summary: 'רשימת עסקאות' })
  listSales(@CurrentUser() user: AuthPrincipal, @Query('branchId') branchId?: string) {
    return this.sales.listSales(user, branchId);
  }

  @Post('sales/:id/refund')
  @RequirePermissions(PERMISSIONS.REFUND_CREATE)
  @ApiOperation({ summary: 'החזר / זיכוי (מסמך נגדי)' })
  refund(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: RefundDto) {
    return this.sales.refund(user, id, dto);
  }

  @Post('sales/:id/invoice')
  @RequirePermissions(PERMISSIONS.INVOICE_ISSUE)
  @ApiOperation({ summary: 'הפקת מסמך (קבלה/חשבונית מס)' })
  issueInvoice(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() body: { type?: InvoiceType },
  ) {
    return this.sales.issueInvoice(user, id, body.type ?? InvoiceType.RECEIPT);
  }

  @Get('sales/:id/receipt')
  @RequirePermissions(PERMISSIONS.SALE_READ)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'קבלה להדפסה/שמירה כ-PDF (HTML)' })
  receipt(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.sales.receiptHtml(user, id);
  }

  @Post('shifts/open')
  @RequirePermissions(PERMISSIONS.CASH_SHIFT_OPEN)
  @ApiOperation({ summary: 'פתיחת משמרת קופה' })
  openShift(@CurrentUser() user: AuthPrincipal, @Body() dto: OpenShiftDto) {
    return this.cash.openShift(user, dto);
  }

  @Post('shifts/:id/movement')
  @RequirePermissions(PERMISSIONS.CASH_MOVEMENT_CREATE)
  @ApiOperation({ summary: 'תנועת קופה (הכנסה/הוצאה/הפקדה)' })
  movement(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: CashMovementDto,
  ) {
    return this.cash.movement(user, id, dto);
  }

  @Post('shifts/:id/close')
  @RequirePermissions(PERMISSIONS.CASH_SHIFT_CLOSE)
  @ApiOperation({ summary: 'סגירת משמרת + חישוב פער' })
  closeShift(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: CloseShiftDto,
  ) {
    return this.cash.closeShift(user, id, dto);
  }
}
