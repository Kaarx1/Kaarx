import { Module } from '@nestjs/common';
import { DriversModule } from '../drivers/drivers.module';
import { GeoModule } from '../geo/geo.module';
import { AdminLiveController } from './controllers/admin-live.controller';
import { PresenceController } from './controllers/presence.controller';
import { PresenceService } from './services/presence.service';
import { PresenceStore } from './presence.store';

@Module({
  imports: [DriversModule, GeoModule],
  controllers: [PresenceController, AdminLiveController],
  providers: [PresenceStore, PresenceService],
  exports: [PresenceStore, PresenceService],
})
export class PresenceModule {}
