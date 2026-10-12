import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  LIVE_BOOKING_STATUSES,
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
import type { AuthUser } from '../../common/auth/auth-user';
import { REDIS } from '../../common/redis.module';
import { Booking } from '../../database/entities';
import { BookingEventsService } from '../booking-events/booking-events.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { DriversService } from '../drivers/drivers.service';
import { PricingService, toRuleInput } from '../pricing/pricing.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { StorageService } from '../storage/storage.service';
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
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
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
    const booking = await this.bookings.findOne({
      where: [
        { driverId: user.id, status: In([...LIVE_BOOKING_STATUSES]) },
        { driverId: user.id, status: 'completed', paymentStatus: 'unpaid' },
      ],
      order: { createdAt: 'DESC' },
    });
    return { booking: booking ? await this.views.driverView(booking) : null };
  }

  async markArrived(user: AuthUser, bookingId: string): Promise<DriverBookingView> {
    const { booking } = await this.mutateOwn(user, bookingId, async (b, manager) => {
      this.requireTransition(b, 'driver_arrived');
      await manager.update(Booking, b.id, { status: 'driver_arrived', arrivedAt: new Date() });
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
        await manager.query(
          `insert into trip_photos (booking_id, driver_id, phase, side, url, taken_at, location)
           values ($1, $2, $3::photo_phase, $4::photo_side, $5, $6,
                   case when $7::float8 is null or $8::float8 is null then null
                        else ST_SetSRID(ST_MakePoint($8::float8, $7::float8), 4326)::geography end)`,
          [
            booking.id,
            user.id,
            input.phase,
            photo.side,
            photo.key,
            photo.takenAt,
            photo.lat ?? null,
            photo.lng ?? null,
          ],
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
      await manager.update(Booking, b.id, {
        status: 'in_progress',
        otpVerifiedAt: startedAt,
        startedAt,
        waitingS,
      });
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
      const trace = await this.tracedDistance(manager, b, startedAt);
      const estimatedDistanceM = b.estimatedDistanceM ?? 0;
      const usedTrace =
        trace.points >= 2 && trace.meters <= estimatedDistanceM * MAX_TRACE_TO_ESTIMATE;
      const distanceM = usedTrace ? Math.round(trace.meters) : estimatedDistanceM;
      const rule = toRuleInput(await this.pricing.getRule(b.pricingRuleId));
      const breakdown = computeFare(rule, { distanceM, waitingS: b.waitingS });
      const settlement = computeSettlement(breakdown.totalPaise, rule.platformCommissionPct);
      await manager.update(Booking, b.id, {
        status: 'completed',
        endedAt,
        actualDistanceM: distanceM,
        actualDurationS: Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
        finalFarePaise: breakdown.totalPaise,
        finalBreakdown: breakdown,
        platformFeePaise: settlement.platformFeePaise,
        driverEarningPaise: settlement.driverEarningPaise,
      });
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
      await manager.update(Booking, b.id, { paymentStatus: 'paid', paidAt: new Date() });
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
    const booking = await this.bookings.findOneBy({ id: bookingId, driverId });
    if (!booking) throw new NotFoundException('Trip not found');
    return booking;
  }

  private async lockOwn(
    manager: EntityManager,
    driverId: string,
    bookingId: string,
  ): Promise<Booking> {
    const booking = await manager.findOne(Booking, {
      where: { id: bookingId, driverId },
      lock: { mode: 'pessimistic_write' },
    });
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
    const booking = await this.bookings.findOneByOrFail({ id: bookingId });
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

  private async photoSides(
    bookingId: string,
    manager: EntityManager = this.ds.manager,
  ): Promise<TripPhotoSides> {
    const rows: { phase: PhotoPhase; side: PhotoSide }[] = await manager.query(
      `select distinct phase, side from trip_photos where booking_id = $1 order by phase, side`,
      [bookingId],
    );
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

  private async tracedDistance(
    manager: EntityManager,
    booking: Booking,
    since: Date,
  ): Promise<{ points: number; meters: number }> {
    const rows: { points: number; meters: number | null }[] = await manager.query(
      `select count(*)::int as points,
              case when count(*) >= 2
                   then ST_Length(ST_MakeLine(location::geometry order by recorded_at)::geography)
              end as meters
         from driver_locations
        where booking_id = $1 and driver_id = $2 and recorded_at >= $3`,
      [booking.id, booking.driverId, since],
    );
    return { points: rows[0]?.points ?? 0, meters: rows[0]?.meters ?? 0 };
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
          await manager.update(Booking, b.id, {
            status: 'searching',
            driverId: null,
            assignedAt: null,
            dispatchRound: 0,
          });
          // Frees booking_offers_one_accepted_uidx so the next driver can accept.
          await manager.query(
            `update booking_offers set response = 'declined', responded_at = now(), decline_reason = $3
            where booking_id = $1 and driver_id = $2 and response = 'accepted'`,
            [b.id, user.id, `released: ${input.reason}`],
          );
          await this.events.record(b.id, 'booking.released', user, payload, manager);
          return b.dispatchRound;
        }
        if (b.status === 'driver_arrived') {
          await manager.update(Booking, b.id, {
            status: 'cancelled',
            cancelledBy: 'driver',
            cancelReason: input.notes ? `${input.reason}: ${input.notes}` : input.reason,
            cancelledAt: new Date(),
          });
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
