import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  adminBookingsQuerySchema,
  type AdminBookingDetail,
  type AdminBookingRow,
  type AdminBookingsQuery,
} from '@kaarx/shared';
import { Roles } from '../../../common/auth/decorators';
import { ZodValidationPipe } from '../../../common/zod-validation.pipe';
import { AdminBookingsService } from '../services/admin-bookings.service';

@Controller('admin/bookings')
@Roles('admin')
export class AdminBookingsController {
  constructor(private readonly adminBookings: AdminBookingsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(adminBookingsQuerySchema)) query: AdminBookingsQuery,
  ): Promise<AdminBookingRow[]> {
    return this.adminBookings.list(query);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminBookingDetail> {
    return this.adminBookings.detail(id);
  }
}
