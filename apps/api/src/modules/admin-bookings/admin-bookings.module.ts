import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { AdminBookingsController } from './controllers/admin-bookings.controller';
import { AdminBookingsService } from './services/admin-bookings.service';

@Module({
  imports: [BookingsModule],
  controllers: [AdminBookingsController],
  providers: [AdminBookingsService],
})
export class AdminBookingsModule {}
