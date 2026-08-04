import { Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SubscriptionsService } from '../subscriptions/subscriptions.module';
import type { AppConfig } from '../config/configuration';

const QUEUE_NAME = 'crm-jobs';

/**
 * Background jobs (BullMQ). Disabled unless ENABLE_WORKERS=true so the API boots
 * cleanly without Redis in development. When enabled it schedules recurring work —
 * currently the subscription-renewal sweep — and processes it off the request path.
 * Report generation, notification dispatch and scheduled agent tasks plug in here.
 */
@Injectable()
class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Jobs');
  private connection?: IORedis;
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.ENABLE_WORKERS !== 'true') {
      this.logger.log('Workers disabled (set ENABLE_WORKERS=true to enable).');
      return;
    }
    const url = this.config.get('redisUrl', { infer: true });
    this.connection = new IORedis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });

    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        if (job.name === 'subscriptions.renew') return this.renewSubscriptions();
        return null;
      },
      { connection: this.connection },
    );
    this.worker.on('failed', (job, err) => this.logger.error(`Job ${job?.name} failed: ${err.message}`));

    // Sweep due subscriptions hourly (idempotent — only charges past-due periods).
    await this.queue.add(
      'subscriptions.renew',
      {},
      { repeat: { every: 60 * 60 * 1000 }, removeOnComplete: true, removeOnFail: 100 },
    );
    this.logger.log('Workers enabled; subscription renewal scheduled hourly.');
  }

  private async renewSubscriptions() {
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true },
    });
    let charged = 0;
    for (const t of tenants) {
      const result = await this.subscriptions.processDue(t.id, 'system:worker');
      charged += result.charged;
    }
    this.logger.log(`Subscription sweep: ${charged} charged across ${tenants.length} tenants.`);
    return { tenants: tenants.length, charged };
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }
}

@Module({
  imports: [SubscriptionsModule],
  providers: [JobsService],
})
export class JobsModule {}
