import { Module } from '@nestjs/common';
import { BookingEventsService } from './booking-events.service';

@Module({
  providers: [BookingEventsService],
  exports: [BookingEventsService],
})
export class BookingEventsModule {}
