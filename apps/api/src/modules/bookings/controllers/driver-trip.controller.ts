import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  driverCancelSchema,
  photoUploadRequestSchema,
  recordPhotosSchema,
  startTripSchema,
  type BookingStatus,
  type DriverBookingView,
  type DriverCancelInput,
  type PhotoUploadRequestInput,
  type PhotoUploadSlot,
  type RecordPhotosInput,
  type StartTripInput,
} from '@kaarx/shared';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ZodValidationPipe } from '../../../common/zod-validation.pipe';
import { TripService, type TripPhotoSides } from '../services/trip.service';

@Controller('driver/bookings')
@Roles('driver')
export class DriverTripController {
  constructor(private readonly trips: TripService) {}

  @Get('current')
  current(@CurrentUser() user: AuthUser): Promise<{ booking: DriverBookingView | null }> {
    return this.trips.getCurrentForDriver(user);
  }

  @Post(':id/arrived')
  @HttpCode(200)
  arrived(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DriverBookingView> {
    return this.trips.markArrived(user, id);
  }

  @Post(':id/photo-uploads')
  @HttpCode(200)
  photoUploads(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(photoUploadRequestSchema)) body: PhotoUploadRequestInput,
  ): Promise<PhotoUploadSlot[]> {
    return this.trips.createPhotoUploads(user, id, body);
  }

  @Post(':id/photos')
  @HttpCode(200)
  photos(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recordPhotosSchema)) body: RecordPhotosInput,
  ): Promise<TripPhotoSides> {
    return this.trips.recordPhotos(user, id, body);
  }

  @Post(':id/start')
  @HttpCode(200)
  start(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(startTripSchema)) body: StartTripInput,
  ): Promise<DriverBookingView> {
    return this.trips.start(user, id, body);
  }

  @Post(':id/end')
  @HttpCode(200)
  end(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DriverBookingView> {
    return this.trips.end(user, id);
  }

  @Post(':id/cash-collected')
  @HttpCode(200)
  cashCollected(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DriverBookingView> {
    return this.trips.confirmCashCollected(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(driverCancelSchema)) body: DriverCancelInput,
  ): Promise<{ status: BookingStatus }> {
    return this.trips.cancelByDriver(user, id, body);
  }
}
