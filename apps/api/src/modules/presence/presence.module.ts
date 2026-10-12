import { Module } from '@nestjs/common';
import { DriversModule } from '../drivers/drivers.module';
import { GeoModule } from '../geo/geo.module';
import { AdminLiveController } from './admin-live.controller';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';
import { PresenceStore } from './presence.store';

@Module({
  imports: [DriversModule, GeoModule],
  controllers: [PresenceController, AdminLiveController],
  providers: [PresenceStore, PresenceService],
  exports: [PresenceStore, PresenceService],
})
export class PresenceModule {}
