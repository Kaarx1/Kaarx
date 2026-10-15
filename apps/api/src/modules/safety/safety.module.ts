import { Module } from '@nestjs/common';
import { BookingEventsModule } from '../booking-events/booking-events.module';
import { AdminSosController } from './controllers/admin-sos.controller';
import { SafetyController } from './controllers/safety.controller';
import { SafetyService } from './services/safety.service';

@Module({
  imports: [BookingEventsModule],
  controllers: [SafetyController, AdminSosController],
  providers: [SafetyService],
})
export class SafetyModule {}
