import { Module } from '@nestjs/common';
import { BookingEventsModule } from '../booking-events/booking-events.module';
import { AdminSosController } from './admin-sos.controller';
import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';

@Module({
  imports: [BookingEventsModule],
  controllers: [SafetyController, AdminSosController],
  providers: [SafetyService],
})
export class SafetyModule {}
