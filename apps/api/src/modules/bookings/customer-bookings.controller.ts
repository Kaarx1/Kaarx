import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  cancelBookingSchema,
  createBookingSchema,
  customerBookingsQuerySchema,
  type CancelBookingInput,
  type CreateBookingInput,
  type CustomerBookingView,
  type CustomerBookingsQuery,
} from '@kaarx/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { BookingsService } from './bookings.service';

@Controller('customer/bookings')
export class CustomerBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @Roles('customer')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createBookingSchema)) body: CreateBookingInput,
  ): Promise<CustomerBookingView> {
    return this.bookings.create(user, body);
  }

  @Get()
  @Roles('customer')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(customerBookingsQuerySchema)) query: CustomerBookingsQuery,
  ): Promise<CustomerBookingView[]> {
    return this.bookings.listForCustomer(user.id, query);
  }

  @Get(':id')
  @Roles('customer')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerBookingView> {
    return this.bookings.getForCustomer(user.id, id);
  }

  @Post(':id/cancel')
  @Roles('customer')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelBookingSchema)) body: CancelBookingInput,
  ): Promise<CustomerBookingView> {
    return this.bookings.cancelByCustomer(user, id, body);
  }
}
