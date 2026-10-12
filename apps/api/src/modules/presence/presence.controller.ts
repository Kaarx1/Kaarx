import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  goOnlineSchema,
  locationBatchSchema,
  type GoOnlineInput,
  type LocationBatchInput,
} from '@kaarx/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { PresenceService } from './presence.service';

@Controller('driver')
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Post('online')
  @HttpCode(200)
  @Roles('driver')
  goOnline(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(goOnlineSchema)) body: GoOnlineInput,
  ): Promise<{ online: true; zoneId: string }> {
    return this.presence.goOnline(user.id, { lat: body.lat, lng: body.lng });
  }

  @Post('offline')
  @HttpCode(204)
  @Roles('driver')
  async goOffline(@CurrentUser() user: AuthUser): Promise<void> {
    await this.presence.goOffline(user.id);
  }

  @Post('locations')
  @HttpCode(202)
  @Roles('driver')
  recordLocations(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(locationBatchSchema)) body: LocationBatchInput,
  ): Promise<{ accepted: number }> {
    return this.presence.recordLocations(user.id, body.points);
  }
}
