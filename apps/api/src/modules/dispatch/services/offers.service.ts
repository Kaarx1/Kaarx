import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  REALTIME_EVENTS,
  type BookingStatus,
  type DeclineOfferInput,
  type DriverBookingView,
  type OfferResponse,
  type OfferView,
} from '@kaarx/shared';
import { DataSource, In, Repository, type EntityManager } from 'typeorm';
import type { AuthUser } from '../../../common/auth/auth-user';
import { isUniqueViolation } from '../../../common/db-errors';
import { Booking, BookingOffer } from '../../../database/entities';
import { BookingEventsService } from '../../booking-events/services/booking-events.service';
import { BookingViewsService } from '../../bookings/services/booking-views.service';
import { toOfferView } from '../../bookings/booking.views';
import { DriversService } from '../../drivers/services/drivers.service';
import { PricingService } from '../../pricing/services/pricing.service';
import { RealtimePublisher } from '../../realtime/realtime.publisher';
import { DispatchService } from './dispatch.service';

const NO_LONGER_AVAILABLE = 'This request is no longer available';

@Injectable()
export class OffersService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(BookingOffer) private readonly offers: Repository<BookingOffer>,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly drivers: DriversService,
    private readonly pricing: PricingService,
    private readonly dispatch: DispatchService,
    private readonly events: BookingEventsService,
    private readonly views: BookingViewsService,
    private readonly publisher: RealtimePublisher,
  ) {}

  async expirePendingForBooking(
    bookingId: string,
    manager?: EntityManager,
  ): Promise<{ id: string; driverId: string }[]> {
    const [rows] = (await (manager ?? this.ds.manager).query(
      `update booking_offers set response = 'expired', responded_at = now()
        where booking_id = $1 and response = 'pending'
        returning id, driver_id as "driverId"`,
      [bookingId],
    )) as [{ id: string; driverId: string }[], number];
    return rows;
  }

  publishWithdrawn(rows: { id: string; driverId: string }[], bookingId: string): void {
    for (const row of rows) {
      this.publisher.toDriver(row.driverId, REALTIME_EVENTS.offerWithdrawn, {
        offerId: row.id,
        bookingId,
      });
    }
  }

  async listPendingForDriver(driverId: string): Promise<OfferView[]> {
    const pending = await this.offers
      .createQueryBuilder('o')
      .where('o.driverId = :driverId', { driverId })
      .andWhere(`o.response = 'pending'`)
      .andWhere('o.expiresAt > now()')
      .orderBy('o.offeredAt', 'DESC')
      .getMany();
    if (pending.length === 0) return [];
    const bookings = new Map(
      (await this.bookings.findBy({ id: In(pending.map((o) => o.bookingId)) })).map((b) => [
        b.id,
        b,
      ]),
    );
    const views: OfferView[] = [];
    for (const offer of pending) {
      const booking = bookings.get(offer.bookingId);
      if (!booking) continue;
      const earning = await this.pricing.driverEarningFor(
        booking.pricingRuleId,
        booking.estimatedFarePaise,
      );
      views.push(toOfferView(offer, booking, earning));
    }
    return views;
  }

  async accept(user: AuthUser, offerId: string): Promise<DriverBookingView> {
    await this.drivers.assertCanDrive(user.id);
    const offer = await this.offers.findOneBy({ id: offerId, driverId: user.id });
    if (!offer) throw new NotFoundException('Offer not found');

    let withdrawn: { id: string; driverId: string }[];
    try {
      withdrawn = await this.ds.transaction(async (m) => {
        const bookingRows = (await m.query('select status from bookings where id = $1 for update', [
          offer.bookingId,
        ])) as { status: BookingStatus }[];
        const offerRows = (await m.query(
          'select response, expires_at > now() as "live" from booking_offers where id = $1 for update',
          [offerId],
        )) as { response: OfferResponse; live: boolean }[];
        const booking = bookingRows[0];
        const locked = offerRows[0];
        if (
          !booking ||
          !locked ||
          booking.status !== 'searching' ||
          locked.response !== 'pending' ||
          !locked.live
        ) {
          throw new ConflictException(NO_LONGER_AVAILABLE);
        }
        await m.query(
          `update booking_offers set response = 'accepted', responded_at = now() where id = $1`,
          [offerId],
        );
        const others = await this.expirePendingForBooking(offer.bookingId, m);
        await m.query(
          `update bookings set status = 'assigned', driver_id = $2, assigned_at = now() where id = $1`,
          [offer.bookingId, user.id],
        );
        await this.events.record(
          offer.bookingId,
          'offer.accepted',
          user,
          { offerId, round: offer.round },
          m,
        );
        return others;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'bookings_driver_one_live_uidx')) {
        throw new ConflictException('Finish your current trip before accepting another');
      }
      throw error;
    }

    this.publishWithdrawn(withdrawn, offer.bookingId);
    await this.dispatch.removeRound(offer.bookingId, offer.round + 1);
    const booking = await this.bookings.findOneByOrFail({ id: offer.bookingId });
    this.publisher.toCustomer(
      booking.customerId,
      REALTIME_EVENTS.bookingUpdated,
      await this.views.customerView(booking),
    );
    return this.views.driverView(booking);
  }

  async decline(user: AuthUser, offerId: string, input: DeclineOfferInput): Promise<void> {
    const [rows] = (await this.ds.query(
      `update booking_offers set response = 'declined', responded_at = now(), decline_reason = $3
        where id = $1 and driver_id = $2 and response = 'pending'
        returning booking_id as "bookingId", round`,
      [offerId, user.id, input.reason ?? null],
    )) as [{ bookingId: string; round: number }[], number];
    const declined = rows[0];
    if (!declined) {
      if ((await this.offers.countBy({ id: offerId, driverId: user.id })) === 0) {
        throw new NotFoundException('Offer not found');
      }
      throw new ConflictException(NO_LONGER_AVAILABLE);
    }

    await this.events.record(declined.bookingId, 'offer.declined', user, {
      offerId,
      reason: input.reason ?? null,
    });
    const pending = (await this.ds.query(
      `select count(*)::int as "pending" from booking_offers
        where booking_id = $1 and round = $2 and response = 'pending'`,
      [declined.bookingId, declined.round],
    )) as { pending: number }[];
    if ((pending[0]?.pending ?? 0) === 0)
      await this.dispatch.promoteRound(declined.bookingId, declined.round + 1);
  }
}
