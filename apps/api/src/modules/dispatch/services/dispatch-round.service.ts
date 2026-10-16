import { Injectable } from '@nestjs/common';
import { REALTIME_EVENTS } from '@kaarx/shared';
import { DataSource } from 'typeorm';
import type { Booking } from '../../../database/entities';
import { fromGeoPoint } from '../../../database/entities/columns';
import {
  BookingOfferRepository,
  BookingRepository,
  DispatchSettingsRepository,
} from '../../../database/repositories';
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
    private readonly bookingRepo: BookingRepository,
    private readonly offerRepo: BookingOfferRepository,
    private readonly settingsRepo: DispatchSettingsRepository,
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
      const row = await this.bookingRepo.lockDispatchState(bookingId, m);
      if (!row || row.status !== 'searching' || row.dispatchRound !== round - 1) return null;
      return this.offers.expirePendingForBooking(bookingId, m);
    });
    if (expired === null) return;
    this.offers.publishWithdrawn(expired, bookingId);

    const booking = await this.bookingRepo.findByIdOrFail(bookingId);
    const settings = await this.settingsRepo.findByCityOrFail(booking.cityId);
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
      if (!(await this.bookingRepo.advanceDispatchRound(bookingId, round, m))) return false;
      if (chosen.length > 0) {
        await this.offerRepo.insertMany(bookingId, round, settings.offerTimeoutSec, chosen, m);
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
      this.offerRepo.findPendingInRound(bookingId, round),
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
    if (!(await this.bookingRepo.markNoDriverFound(booking.id))) return;
    await this.events.record(booking.id, 'booking.no_driver_found', null, { rounds: round - 1 });
    const fresh = await this.bookingRepo.findByIdOrFail(booking.id);
    this.publisher.toCustomer(
      fresh.customerId,
      REALTIME_EVENTS.bookingUpdated,
      await this.views.customerView(fresh),
    );
  }
}
