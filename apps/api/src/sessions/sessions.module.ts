import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { AccessProfilesModule } from '../access-profiles/access-profiles.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [RealtimeModule, AccessProfilesModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
