import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { DataSource, EntityManager } from 'typeorm';
import {
  REALTIME_EVENTS,
  REQUIRED_PHOTO_SIDES,
  canTransition,
  computeFare,
  computeSettlement,
  type BookingStatus,
  type DriverBookingView,
  type DriverCancelInput,
  type PhotoPhase,
  type PhotoSide,
  type PhotoUploadRequestInput,
  type PhotoUploadSlot,
  type RecordPhotosInput,
  type StartTripInput,
} from '@kaarx/shared';
import type { AuthUser } from '../../../common/auth/auth-user';
import { REDIS } from '../../../common/redis.module';
import type { Booking } from '../../../database/entities';
import {
  BookingOfferRepository,
  BookingRepository,
  DriverLocationRepository,
  TripPhotoRepository,
} from '../../../database/repositories';
import { BookingEventsService } from '../../booking-events/services/booking-events.service';
import { DispatchService } from '../../dispatch/services/dispatch.service';
import { DriversService } from '../../drivers/services/drivers.service';
import { PricingService, toRuleInput } from '../../pricing/services/pricing.service';
import { RealtimePublisher } from '../../realtime/realtime.publisher';
import { StorageService } from '../../storage/services/storage.service';
import { BookingViewsService } from './booking-views.service';

const MAX_WRONG_TRIP_OTP = 5;
const TRIP_OTP_WINDOW_SEC = 3600;
const MAX_TRACE_TO_ESTIMATE = 1.5;
const PHOTO_CONTENT_TYPE = 'image/jpeg';
const WRONG_STATE_MESSAGE = 'This trip has moved on. Refresh to see where it stands.';

export interface TripPhotoSides {
  preTrip: PhotoSide[];
  postTrip: PhotoSide[];
}

@Injectable()
export class TripService {
  constructor(
    private readonly ds: DataSource,
    private readonly bookingRepo: BookingRepository,
    private readonly offerRepo: BookingOfferRepository,
    private readonly photoRepo: TripPhotoRepository,
    private readonly locationRepo: DriverLocationRepository,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly views: BookingViewsService,
    private readonly events: BookingEventsService,
    private readonly drivers: DriversService,
    private readonly pricing: PricingService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimePublisher,
    private readonly dispatch: DispatchService,
  ) {}

  async getCurrentForDriver(user: AuthUser): Promise<{ booking: DriverBookingView | null }> {
    const booking = await this.bookingRepo.findCurrentByDriver(user.id);
    return { booking: booking ? await this.views.driverView(booking) : null };
  }

  async markArrived(user: AuthUser, bookingId: string): Promise<DriverBookingView> {
    const { booking } = await this.mutateOwn(user, bookingId, async (b, manager) => {
      this.requireTransition(b, 'driver_arrived');
      await this.bookingRepo.update(
        b.id,
        { status: 'driver_arrived', arrivedAt: new Date() },
        manager,
      );
      await this.events.record(b.id, 'trip.arrived', user, {}, manager);
    });
    return this.views.driverView(booking);
  }

  async createPhotoUploads(
    user: AuthUser,
    bookingId: string,
    input: PhotoUploadRequestInput,
  ): Promise<PhotoUploadSlot[]> {
    const booking = await this.findOwn(user.id, bookingId);
    this.requirePhotoPhase(booking, input.phase);
    const slots: PhotoUploadSlot[] = [];
    for (const side of [...new Set(input.sides)]) {
      const key = `trips/${booking.id}/${input.phase}/${side}-${randomUUID()}.jpg`;
      slots.push({ side, key, uploadUrl: await this.storage.presignPut(key, PHOTO_CONTENT_TYPE) });
    }
    return slots;
  }

  async recordPhotos(
    user: AuthUser,
    bookingId: string,
    input: RecordPhotosInput,
  ): Promise<TripPhotoSides> {
    const booking = await this.findOwn(user.id, bookingId);
    this.requirePhotoPhase(booking, input.phase);
    const prefix = `trips/${booking.id}/${input.phase}/`;
    if (input.photos.some((photo) => !photo.key.startsWith(prefix))) {
      throw new BadRequestException('This photo does not belong to this trip');
    }
    await this.ds.transaction(async (manager) => {
      for (const photo of input.photos) {
        await this.photoRepo.insert(
          {
            bookingId: booking.id,
            driverId: user.id,
            phase: input.phase,
            side: photo.side,
            url: photo.key,
            takenAt: photo.takenAt,
            lat: photo.lat ?? null,
            lng: photo.lng ?? null,
          },
          manager,
        );
      }
      await this.events.record(
        booking.id,
        'photos.recorded',
        user,
        { phase: input.phase, sides: input.photos.map((photo) => photo.side) },
        manager,
      );
    });
    return this.photoSides(booking.id);
  }

  async start(
    user: AuthUser,
    bookingId: string,
    input: StartTripInput,
  ): Promise<DriverBookingView> {
    const { booking } = await this.mutateOwn(user, bookingId, async (b, manager) => {
      this.requireTransition(b, 'in_progress');
      await this.requirePhotos(
        b.id,
        'pre_trip',
        'Take all vehicle photos before starting the trip',
        manager,
      );
      await this.verifyTripOtp(b, input.otp);
      const startedAt = new Date();
      const waitingS = b.arrivedAt
        ? Math.max(0, Math.floor((startedAt.getTime() - b.arrivedAt.getTime()) / 1000))
        : 0;
      await this.bookingRepo.update(
        b.id,
        {
          status: 'in_progress',
          otpVerifiedAt: startedAt,
          startedAt,
          waitingS,
        },
        manager,
      );
      await this.events.record(b.id, 'trip.started', user, { waitingS }, manager);
    });
    return this.views.driverView(booking);
  }

  async end(user: AuthUser, bookingId: string): Promise<DriverBookingView> {
    const { booking } = await this.mutateOwn(user, bookingId, async (b, manager) => {
      this.requireTransition(b, 'completed');
      await this.requirePhotos(
        b.id,
        'post_trip',
        'Take all vehicle photos before ending the trip',
        manager,
      );
      const endedAt = new Date();
      const startedAt = b.startedAt ?? endedAt;
      const trace = await this.locationRepo.getTracedDistance(b.id, user.id, startedAt, manager);
      const estimatedDistanceM = b.estimatedDistanceM ?? 0;
      const usedTrace =
        trace.points >= 2 && trace.meters <= estimatedDistanceM * MAX_TRACE_TO_ESTIMATE;
      const distanceM = usedTrace ? Math.round(trace.meters) : estimatedDistanceM;
      const rule = toRuleInput(await this.pricing.getRule(b.pricingRuleId));
      const breakdown = computeFare(rule, { distanceM, waitingS: b.waitingS });
      const settlement = computeSettlement(breakdown.totalPaise, rule.platformCommissionPct);
      await this.bookingRepo.update(
        b.id,
        {
          status: 'completed',
          endedAt,
          actualDistanceM: distanceM,
          actualDurationS: Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
          finalFarePaise: breakdown.totalPaise,
          finalBreakdown: breakdown,
          platformFeePaise: settlement.platformFeePaise,
          driverEarningPaise: settlement.driverEarningPaise,
        },
        manager,
      );
      await this.drivers.incrementTrips(user.id, manager);
      await this.events.record(
        b.id,
        'fare.computed',
        user,
        {
          tracedDistanceM: Math.round(trace.meters),
          tracePoints: trace.points,
          estimatedDistanceM,
          usedTrace,
          distanceM,
          totalPaise: breakdown.totalPaise,
        },
        manager,
      );
      await this.events.record(
        b.id,
        'trip.ended',
        user,
        { finalFarePaise: breakdown.totalPaise },
        manager,
      );
    });
    return this.views.driverView(booking);
  }

  async confirmCashCollected(user: AuthUser, bookingId: string): Promise<DriverBookingView> {
    const { booking } = await this.mutateOwn(user, bookingId, async (b, manager) => {
      if (b.status !== 'completed' || b.paymentStatus !== 'unpaid') {
        throw new ConflictException('This trip is not waiting for payment');
      }
      await this.bookingRepo.update(b.id, { paymentStatus: 'paid', paidAt: new Date() }, manager);
      await this.events.record(
        b.id,
        'payment.cash_collected',
        user,
        { amountPaise: b.finalFarePaise },
        manager,
      );
    });
    return this.views.driverView(booking);
  }

  async notifyCustomer(booking: Booking): Promise<void> {
    this.realtime.toCustomer(
      booking.customerId,
      REALTIME_EVENTS.bookingUpdated,
      await this.views.customerView(booking),
    );
  }

  private async findOwn(driverId: string, bookingId: string): Promise<Booking> {
    const booking = await this.bookingRepo.findOwnedByDriver(driverId, bookingId);
    if (!booking) throw new NotFoundException('Trip not found');
    return booking;
  }

  private async lockOwn(
    manager: EntityManager,
    driverId: string,
    bookingId: string,
  ): Promise<Booking> {
    const booking = await this.bookingRepo.lockOwnedByDriver(driverId, bookingId, manager);
    if (!booking) throw new NotFoundException('Trip not found');
    return booking;
  }

  // Locks the driver's own booking, runs `work` in one transaction, then reloads and tells the customer.
  private async mutateOwn<T>(
    user: AuthUser,
    bookingId: string,
    work: (booking: Booking, manager: EntityManager) => Promise<T>,
  ): Promise<{ booking: Booking; result: T }> {
    const result = await this.ds.transaction(async (manager) =>
      work(await this.lockOwn(manager, user.id, bookingId), manager),
    );
    const booking = await this.bookingRepo.findByIdOrFail(bookingId);
    await this.notifyCustomer(booking);
    return { booking, result };
  }

  private requireTransition(booking: Booking, to: BookingStatus): void {
    if (!canTransition(booking.status, to)) throw new ConflictException(WRONG_STATE_MESSAGE);
  }

  private requirePhotoPhase(booking: Booking, phase: PhotoPhase): void {
    if (phase === 'pre_trip' && booking.status !== 'driver_arrived') {
      throw new ConflictException('Pre-trip photos are taken at pickup');
    }
    if (phase === 'post_trip' && booking.status !== 'in_progress') {
      throw new ConflictException('Post-trip photos are taken at drop-off');
    }
  }

  private async requirePhotos(
    bookingId: string,
    phase: PhotoPhase,
    message: string,
    manager: EntityManager,
  ): Promise<void> {
    const sides = await this.photoSides(bookingId, manager);
    const done = phase === 'pre_trip' ? sides.preTrip : sides.postTrip;
    const missingSides = REQUIRED_PHOTO_SIDES.filter((side) => !done.includes(side));
    if (missingSides.length > 0) throw new ConflictException({ message, missingSides });
  }

  private async photoSides(bookingId: string, manager?: EntityManager): Promise<TripPhotoSides> {
    const rows = await this.photoRepo.findSidesByBooking(bookingId, manager);
    return {
      preTrip: rows.filter((row) => row.phase === 'pre_trip').map((row) => row.side),
      postTrip: rows.filter((row) => row.phase === 'post_trip').map((row) => row.side),
    };
  }

  private async verifyTripOtp(booking: Booking, otp: string): Promise<void> {
    const key = `trip-otp:${booking.id}`;
    const wrongAttempts = Number((await this.redis.get(key)) ?? 0);
    if (wrongAttempts >= MAX_WRONG_TRIP_OTP) {
      throw new HttpException(
        'Too many wrong codes. Call the customer or Kaarx support.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (otp !== booking.otpCode) {
      await this.redis.multi().incr(key).expire(key, TRIP_OTP_WINDOW_SEC).exec();
      throw new BadRequestException('That code is incorrect. Ask the customer to check their app.');
    }
    await this.redis.del(key);
  }

  async cancelByDriver(
    user: AuthUser,
    bookingId: string,
    input: DriverCancelInput,
  ): Promise<{ status: BookingStatus }> {
    const { booking, result: releasedFromRound } = await this.mutateOwn(
      user,
      bookingId,
      async (b, manager) => {
        const payload = { reason: input.reason, notes: input.notes ?? null };
        if (b.status === 'assigned') {
          await this.bookingRepo.update(
            b.id,
            {
              status: 'searching',
              driverId: null,
              assignedAt: null,
              dispatchRound: 0,
            },
            manager,
          );
          // Frees booking_offers_one_accepted_uidx so the next driver can accept.
          await this.offerRepo.declineAccepted(b.id, user.id, `released: ${input.reason}`, manager);
          await this.events.record(b.id, 'booking.released', user, payload, manager);
          return b.dispatchRound;
        }
        if (b.status === 'driver_arrived') {
          await this.bookingRepo.update(
            b.id,
            {
              status: 'cancelled',
              cancelledBy: 'driver',
              cancelReason: input.notes ? `${input.reason}: ${input.notes}` : input.reason,
              cancelledAt: new Date(),
            },
            manager,
          );
          await this.events.record(
            b.id,
            'booking.cancelled',
            user,
            { by: 'driver', ...payload },
            manager,
          );
          return null;
        }
        throw new ConflictException('This trip can no longer be cancelled');
      },
    );
    if (releasedFromRound !== null) await this.dispatch.restart(booking.id, releasedFromRound);
    return { status: booking.status };
  }
}
