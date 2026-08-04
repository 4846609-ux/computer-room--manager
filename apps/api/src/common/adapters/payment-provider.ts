import { Injectable } from '@nestjs/common';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface ChargeRequest {
  amountMinor: number;
  currency: string;
  /** A tokenized card reference from the PSP's client SDK — never raw PAN. */
  paymentToken: string;
  idempotencyKey: string;
  description?: string;
}

export interface ChargeResult {
  approved: boolean;
  pspReference?: string;
  cardLast4?: string;
  declineReason?: string;
}

/**
 * Adapter boundary for card acquiring / PSPs. No full card data ever reaches the
 * server — only a PSP token and (optionally) the last 4 digits are returned. A
 * real integration (e.g. an Israeli acquirer) implements this interface.
 */
export interface PaymentProvider {
  charge(request: ChargeRequest): Promise<ChargeResult>;
  refund(pspReference: string, amountMinor: number, idempotencyKey: string): Promise<ChargeResult>;
}

/**
 * Manual/offline default: approves cash-equivalent flows without contacting a PSP.
 * Card flows should replace this with a real acquirer adapter in production.
 */
@Injectable()
export class ManualPaymentProvider implements PaymentProvider {
  async charge(request: ChargeRequest): Promise<ChargeResult> {
    return { approved: true, pspReference: `manual_${request.idempotencyKey}` };
  }

  async refund(pspReference: string): Promise<ChargeResult> {
    return { approved: true, pspReference };
  }
}
