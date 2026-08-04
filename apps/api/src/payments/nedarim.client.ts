import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';

/**
 * Server-side client for Nedarim Plus management actions that use the secret
 * ApiPassword (refund / cancel / history). The interactive charge itself happens
 * in the browser iframe — never here — so no card data passes through the server.
 */
@Injectable()
export class NedarimClient {
  private readonly logger = new Logger('NedarimClient');

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private cfg() {
    return this.config.get('nedarim', { infer: true });
  }

  isConfigured(): boolean {
    const c = this.cfg();
    return Boolean(c.mosadId && c.apiValid);
  }

  /** Full refund of a transaction (partial refunds are discouraged by tax rules). */
  async refund(transactionId: string, amountShekels: number): Promise<{ ok: boolean; message?: string }> {
    const c = this.cfg();
    if (!c.apiPassword) return { ok: false, message: 'NEDARIM_API_PASSWORD not configured' };
    const body = new URLSearchParams({
      Action: 'RefundTransaction',
      MosadId: c.mosadId,
      ApiPassword: c.apiPassword,
      TransactionId: transactionId,
      RefundAmount: String(amountShekels),
    });
    try {
      const res = await fetch(c.manageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const text = await res.text();
      // Responses may be JSON or plain text; look for OK.
      const ok = /"?Result"?\s*[:=]?\s*"?OK/i.test(text) || text.trim() === 'OK';
      return { ok, message: ok ? undefined : text.slice(0, 300) };
    } catch (e) {
      this.logger.error(`Nedarim refund failed: ${(e as Error).message}`);
      return { ok: false, message: (e as Error).message };
    }
  }
}
