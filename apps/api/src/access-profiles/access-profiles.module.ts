import { Module } from '@nestjs/common';
import { AccessProfilesController } from './access-profiles.controller';
import { AccessProfilesService } from './access-profiles.service';

@Module({
  controllers: [AccessProfilesController],
  providers: [AccessProfilesService],
  exports: [AccessProfilesService],
})
export class AccessProfilesModule {}
