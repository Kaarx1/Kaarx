import { Module } from '@nestjs/common';
import { BookingEventsService } from './services/booking-events.service';

@Module({
  providers: [BookingEventsService],
  exports: [BookingEventsService],
})
export class BookingEventsModule {}
