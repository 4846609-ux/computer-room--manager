import { Global, Module } from '@nestjs/common';
import {
  LoggingNotificationProvider,
  NOTIFICATION_PROVIDER,
} from './notification-provider';
import { ManualPaymentProvider, PAYMENT_PROVIDER } from './payment-provider';
import { NoopStorageProvider, STORAGE_PROVIDER } from './storage-provider';

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
    { provide: STORAGE_PROVIDER, useClass: NoopStorageProvider },
  ],
  exports: [NOTIFICATION_PROVIDER, PAYMENT_PROVIDER, STORAGE_PROVIDER],
})
export class AdaptersModule {}
