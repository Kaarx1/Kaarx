import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  LIVE_BOOKING_STATUSES,
  REALTIME_EVENTS,
  canTransition,
  computeCancellationFee,
  type BookingStatus,
  type CancelBookingInput,
  type CreateBookingInput,
  type CustomerBookingView,
  type CustomerBookingsQuery,
} from '@kaarx/shared';
import { randomInt } from 'node:crypto';
import { DataSource, In, Not, Repository } from 'typeorm';
import type { AuthUser } from '../../../common/auth/auth-user';
import { isUniqueViolation } from '../../../common/db-errors';
import { Booking } from '../../../database/entities';
import { toGeoPoint } from '../../../database/entities/columns';
import { BookingEventsService } from '../../booking-events/services/booking-events.service';
import { toVehicleSnapshot } from '../../customers/customer.views';
import { CustomersService } from '../../customers/services/customers.service';
import { DispatchService } from '../../dispatch/services/dispatch.service';
import { OffersService } from '../../dispatch/services/offers.service';
import { RealtimePublisher } from '../../realtime/realtime.publisher';
import { PricingService } from '../../pricing/services/pricing.service';
import { BookingViewsService } from './booking-views.service';

const ACTIVE_STATUSES: BookingStatus[] = ['searching', ...LIVE_BOOKING_STATUSES];
const LIST_LIMIT = 20;

@Injectable()
export class BookingsService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly customers: CustomersService,
    private readonly pricing: PricingService,
    private readonly dispatch: DispatchService,
    private readonly events: BookingEventsService,
    private readonly views: BookingViewsService,
    private readonly offers: OffersService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async create(user: AuthUser, input: CreateBookingInput): Promise<CustomerBookingView> {
    await this.customers.assertCanBook(user.id);
    const vehicle = await this.customers.getVehicleForBooking(user.id, input.vehicleId);
    const quote = await this.pricing.quote({
      pickup: input.pickup,
      dropoff: input.dropoff,
      bodyType: vehicle.bodyType,
    });

    let bookingId: string;
    try {
      bookingId = await this.ds.transaction(async (m) => {
        const inserted = await m.getRepository(Booking).insert({
          customerId: user.id,
          vehicleId: vehicle.id,
          vehicleSnapshot: toVehicleSnapshot(vehicle),
          cityId: quote.cityId,
          zoneId: quote.zoneId,
          type: 'instant',
          status: 'searching',
          pickupAddress: input.pickup.address,
          pickupLocation: toGeoPoint(input.pickup),
          pickupInstructions: input.pickup.instructions ?? null,
          dropoffAddress: input.dropoff.address,
          dropoffLocation: toGeoPoint(input.dropoff),
          notes: input.notes ?? null,
          pricingRuleId: quote.pricingRuleId,
          estimatedDistanceM: quote.distanceM,
          estimatedDurationS: quote.durationS,
          estimatedFarePaise: quote.breakdown.totalPaise,
          estimatedBreakdown: quote.breakdown,
          otpCode: randomInt(0, 10_000).toString().padStart(4, '0'),
          paymentMethod: 'cash',
        });
        const id = String(inserted.identifiers[0]?.['id']);
        await this.events.record(
          id,
          'booking.created',
          user,
          {
            farePaise: quote.breakdown.totalPaise,
            distanceM: quote.distanceM,
            pricingRuleId: quote.pricingRuleId,
          },
          m,
        );
        return id;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'bookings_customer_one_active_uidx')) {
        throw new ConflictException('You already have a booking in progress');
      }
      throw error;
    }

    await this.dispatch.scheduleRound(bookingId, 1);
    return this.views.customerView(await this.bookings.findOneByOrFail({ id: bookingId }));
  }

  async findOwned(customerId: string, bookingId: string): Promise<Booking> {
    const booking = await this.bookings.findOneBy({ id: bookingId, customerId });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async getForCustomer(customerId: string, bookingId: string): Promise<CustomerBookingView> {
    return this.views.customerView(await this.findOwned(customerId, bookingId));
  }

  async listForCustomer(
    customerId: string,
    query: CustomerBookingsQuery,
  ): Promise<CustomerBookingView[]> {
    const rows = await this.bookings.find({
      where: {
        customerId,
        status: query.scope === 'active' ? In(ACTIVE_STATUSES) : Not(In(ACTIVE_STATUSES)),
      },
      order: { createdAt: 'DESC' },
      take: LIST_LIMIT,
    });
    return this.views.customerViews(rows);
  }

  async cancelByCustomer(
    user: AuthUser,
    bookingId: string,
    input: CancelBookingInput,
  ): Promise<CustomerBookingView> {
    await this.findOwned(user.id, bookingId);
    const withdrawn = await this.ds.transaction(async (manager) => {
      const booking = await manager.findOneOrFail(Booking, {
        where: { id: bookingId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!canTransition(booking.status, 'cancelled')) {
        throw new ConflictException('This booking can no longer be cancelled');
      }
      const rule = await this.pricing.getRule(booking.pricingRuleId);
      const now = new Date();
      const feePaise = computeCancellationFee({
        status: booking.status,
        assignedAt: booking.assignedAt,
        now,
        graceSec: rule.cancellationGraceSec,
        feePaise: rule.cancellationFeePaise,
      });
      await manager.update(Booking, booking.id, {
        status: 'cancelled',
        cancelledBy: 'customer',
        cancelReason: input.reason,
        cancellationFeePaise: feePaise,
        cancelledAt: now,
      });
      await this.events.record(
        booking.id,
        'booking.cancelled',
        user,
        { by: 'customer', reason: input.reason, feePaise },
        manager,
      );
      return this.offers.expirePendingForBooking(booking.id, manager);
    });

    const booking = await this.bookings.findOneByOrFail({ id: bookingId });
    this.offers.publishWithdrawn(withdrawn, booking.id);
    if (booking.driverId) {
      this.realtime.toDriver(
        booking.driverId,
        REALTIME_EVENTS.bookingUpdated,
        await this.views.driverView(booking),
      );
    }
    const view = await this.views.customerView(booking);
    this.realtime.toCustomer(booking.customerId, REALTIME_EVENTS.bookingUpdated, view);
    return view;
  }
}
