import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { ComputersController } from './computers.controller';
import { ComputersService } from './computers.service';

@Module({
  imports: [RealtimeModule],
  controllers: [ComputersController],
  providers: [ComputersService],
})
export class ComputersModule {}
