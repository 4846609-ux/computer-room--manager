import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { PosController } from './pos.controller';
import { SalesService } from './sales.service';
import { CashService } from './cash.service';

@Module({
  imports: [RealtimeModule],
  controllers: [PosController],
  providers: [SalesService, CashService],
})
export class PosModule {}
