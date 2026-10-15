import { Controller, Get } from '@nestjs/common';
import type { OnlineDriverView } from '@kaarx/shared';
import { Roles } from '../../../common/auth/decorators';
import { PresenceService } from '../services/presence.service';

@Controller('admin/live')
export class AdminLiveController {
  constructor(private readonly presence: PresenceService) {}

  @Get('drivers')
  @Roles('admin')
  listDrivers(): Promise<OnlineDriverView[]> {
    return this.presence.listOnlineDrivers();
  }
}
