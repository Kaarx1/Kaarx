import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { REALTIME_EVENTS, type BookingStatus } from '@kaarx/shared';
import { DataSource, Repository } from 'typeorm';
import { Booking, BookingOffer, DispatchSettings } from '../../../database/entities';
import { fromGeoPoint } from '../../../database/entities/columns';
import { BookingEventsService } from '../../booking-events/services/booking-events.service';
import { BookingViewsService } from '../../bookings/services/booking-views.service';
import { toOfferView } from '../../bookings/booking.views';
import { DriversService } from '../../drivers/services/drivers.service';
import { PresenceStore } from '../../presence/presence.store';
import { PricingService } from '../../pricing/services/pricing.service';
import { RealtimePublisher } from '../../realtime/realtime.publisher';
import { DispatchService } from './dispatch.service';
import { OffersService } from './offers.service';

@Injectable()
export class DispatchRoundService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectRepository(BookingOffer) private readonly offerRows: Repository<BookingOffer>,
    @InjectRepository(DispatchSettings) private readonly settings: Repository<DispatchSettings>,
    private readonly drivers: DriversService,
    private readonly presence: PresenceStore,
    private readonly pricing: PricingService,
    private readonly offers: OffersService,
    private readonly dispatch: DispatchService,
    private readonly events: BookingEventsService,
    private readonly views: BookingViewsService,
    private readonly publisher: RealtimePublisher,
  ) {}

  async runRound(bookingId: string, round: number): Promise<void> {
    const expired = await this.ds.transaction(async (m) => {
      const rows = (await m.query(
        'select status, dispatch_round as "dispatchRound" from bookings where id = $1 for update',
        [bookingId],
      )) as { status: BookingStatus; dispatchRound: number }[];
      const row = rows[0];
      if (!row || row.status !== 'searching' || row.dispatchRound !== round - 1) return null;
      return this.offers.expirePendingForBooking(bookingId, m);
    });
    if (expired === null) return;
    this.offers.publishWithdrawn(expired, bookingId);

    const booking = await this.bookings.findOneByOrFail({ id: bookingId });
    const settings = await this.settings.findOneByOrFail({ cityId: booking.cityId });
    if (round > settings.maxRounds) return this.finishWithoutDriver(booking, round);

    const steps = settings.radiusStepsKm;
    const radiusKm = steps[Math.min(round, steps.length) - 1] ?? settings.initialRadiusKm;
    const nearby = await this.presence.findNearby(
      booking.cityId,
      fromGeoPoint(booking.pickupLocation),
      radiusKm,
    );
    const eligible = await this.drivers.findEligibleForOffer(
      nearby.map((n) => n.driverId),
      booking.vehicleSnapshot,
      booking.id,
    );
    const chosen = nearby
      .filter((n) => eligible.has(n.driverId))
      .slice(0, settings.maxSimultaneousOffers);

    const opened = await this.ds.transaction(async (m) => {
      const [updated] = (await m.query(
        `update bookings set dispatch_round = $2
          where id = $1 and status = 'searching' and dispatch_round = $3
          returning id`,
        [bookingId, round, round - 1],
      )) as [{ id: string }[], number];
      if (updated.length === 0) return false;
      if (chosen.length > 0) {
        await m.query(
          `insert into booking_offers (booking_id, driver_id, round, distance_to_pickup_m, expires_at)
           select $1, t.driver_id, $2, t.distance_m, now() + make_interval(secs => $3::float8)
             from unnest($4::uuid[], $5::int[]) as t(driver_id, distance_m)`,
          [
            bookingId,
            round,
            settings.offerTimeoutSec,
            chosen.map((c) => c.driverId),
            chosen.map((c) => c.distanceM),
          ],
        );
      }
      return true;
    });
    if (!opened) return;

    await this.dispatch.scheduleRound(bookingId, round + 1, settings.offerTimeoutSec * 1000);
    await this.events.record(bookingId, 'dispatch.round', null, {
      round,
      radiusKm,
      driverIds: chosen.map((c) => c.driverId),
    });
    if (chosen.length === 0) return;

    const [created, earning] = await Promise.all([
      this.offerRows.findBy({ bookingId, round, response: 'pending' }),
      this.pricing.driverEarningFor(booking.pricingRuleId, booking.estimatedFarePaise),
    ]);
    for (const offer of created) {
      this.publisher.toDriver(
        offer.driverId,
        REALTIME_EVENTS.offerNew,
        toOfferView(offer, booking, earning),
      );
    }
  }

  private async finishWithoutDriver(booking: Booking, round: number): Promise<void> {
    const [updated] = (await this.ds.query(
      `update bookings set status = 'no_driver_found' where id = $1 and status = 'searching' returning id`,
      [booking.id],
    )) as [{ id: string }[], number];
    if (updated.length === 0) return;
    await this.events.record(booking.id, 'booking.no_driver_found', null, { rounds: round - 1 });
    const fresh = await this.bookings.findOneByOrFail({ id: booking.id });
    this.publisher.toCustomer(
      fresh.customerId,
      REALTIME_EVENTS.bookingUpdated,
      await this.views.customerView(fresh),
    );
  }
}
