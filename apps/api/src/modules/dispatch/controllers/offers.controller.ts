import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  declineOfferSchema,
  type DeclineOfferInput,
  type DriverBookingView,
  type OfferView,
} from '@kaarx/shared';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ZodValidationPipe } from '../../../common/zod-validation.pipe';
import { OffersService } from '../services/offers.service';

@Controller('driver/offers')
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Get()
  @Roles('driver')
  list(@CurrentUser() user: AuthUser): Promise<OfferView[]> {
    return this.offers.listPendingForDriver(user.id);
  }

  @Post(':id/accept')
  @HttpCode(200)
  @Roles('driver')
  accept(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DriverBookingView> {
    return this.offers.accept(user, id);
  }

  @Post(':id/decline')
  @HttpCode(204)
  @Roles('driver')
  async decline(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(declineOfferSchema)) body: DeclineOfferInput,
  ): Promise<void> {
    await this.offers.decline(user, id, body);
  }
}
