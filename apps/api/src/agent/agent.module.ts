import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [RealtimeModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
