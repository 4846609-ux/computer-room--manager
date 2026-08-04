import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [RealtimeModule, NotificationsModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
