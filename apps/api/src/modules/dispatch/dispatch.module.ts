import { BullModule } from '@nestjs/bullmq';
import { Module, type Provider } from '@nestjs/common';
import { runsWorker } from '../../config/env';
import { BookingEventsModule } from '../booking-events/booking-events.module';
import { BookingViewsService } from '../bookings/booking-views.service';
import { CustomersModule } from '../customers/customers.module';
import { DriversModule } from '../drivers/drivers.module';
import { PresenceModule } from '../presence/presence.module';
import { PricingModule } from '../pricing/pricing.module';
import { DISPATCH_QUEUE } from './dispatch.constants';
import { DispatchRoundService } from './dispatch-round.service';
import { DispatchProcessor } from './dispatch.processor';
import { DispatchService } from './dispatch.service';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';

const workerProviders: Provider[] = runsWorker ? [DispatchProcessor] : [];

@Module({
  imports: [
    BullModule.registerQueue({ name: DISPATCH_QUEUE }),
    DriversModule,
    PresenceModule,
    PricingModule,
    CustomersModule,
    BookingEventsModule,
  ],
  controllers: [OffersController],
  providers: [
    DispatchService,
    OffersService,
    DispatchRoundService,
    BookingViewsService,
    ...workerProviders,
  ],
  exports: [DispatchService, OffersService, BookingViewsService],
})
export class DispatchModule {}
