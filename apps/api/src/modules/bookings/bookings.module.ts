import { Module } from '@nestjs/common';
import { BookingEventsModule } from '../booking-events/booking-events.module';
import { CustomersModule } from '../customers/customers.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { DriversModule } from '../drivers/drivers.module';
import { PricingModule } from '../pricing/pricing.module';
import { BookingsService } from './bookings.service';
import { CustomerBookingsController } from './customer-bookings.controller';
import { DriverTripController } from './driver-trip.controller';
import { TripService } from './trip.service';

@Module({
  imports: [CustomersModule, DriversModule, PricingModule, DispatchModule, BookingEventsModule],
  controllers: [CustomerBookingsController, DriverTripController],
  providers: [BookingsService, TripService],
  exports: [BookingsService, DispatchModule],
})
export class BookingsModule {}
