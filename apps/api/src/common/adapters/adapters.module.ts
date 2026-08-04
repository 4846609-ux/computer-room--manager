import { Global, Module } from '@nestjs/common';
import {
  LoggingNotificationProvider,
  NOTIFICATION_PROVIDER,
} from './notification-provider';
import { ManualPaymentProvider, PAYMENT_PROVIDER } from './payment-provider';

/**
 * Binds adapter interfaces to their default implementations. Swap these providers
 * (e.g. via env-driven factory providers) to integrate real vendors without
 * touching domain code.
 */
@Global()
@Module({
  providers: [
    { provide: NOTIFICATION_PROVIDER, useClass: LoggingNotificationProvider },
    { provide: PAYMENT_PROVIDER, useClass: ManualPaymentProvider },
  ],
  exports: [NOTIFICATION_PROVIDER, PAYMENT_PROVIDER],
})
export class AdaptersModule {}
