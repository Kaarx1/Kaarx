import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { fareEstimateSchema, type FareEstimateInput, type FareEstimateView } from '@kaarx/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CustomersService } from '../customers/customers.service';
import { PricingService } from './pricing.service';

@Controller('customer')
export class PricingController {
  constructor(
    private readonly pricing: PricingService,
    private readonly customers: CustomersService,
  ) {}

  @Post('fare-estimate')
  @HttpCode(200)
  @Roles('customer')
  async estimate(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(fareEstimateSchema)) body: FareEstimateInput,
  ): Promise<FareEstimateView> {
    const vehicle = await this.customers.getVehicleForBooking(user.id, body.vehicleId);
    const quote = await this.pricing.quote({
      pickup: body.pickup,
      dropoff: body.dropoff,
      bodyType: vehicle.bodyType,
    });
    return { distanceM: quote.distanceM, durationS: quote.durationS, breakdown: quote.breakdown };
  }
}
