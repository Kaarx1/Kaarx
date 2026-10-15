import { Controller, Get } from '@nestjs/common';
import type { DriverSelfView } from '@kaarx/shared';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { DriversService } from '../services/drivers.service';

@Roles('driver')
@Controller('driver')
export class DriverMeController {
  constructor(private readonly drivers: DriversService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<DriverSelfView> {
    return this.drivers.getSelf(user.id);
  }
}
