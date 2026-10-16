import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  REALTIME_EVENTS,
  type DeclineOfferInput,
  type DriverBookingView,
  type OfferView,
} from '@kaarx/shared';
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthUser } from '../../../common/auth/auth-user';
import { isUniqueViolation } from '../../../common/db-errors';
import { BookingOfferRepository, BookingRepository } from '../../../database/repositories';
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
    private readonly offerRepo: BookingOfferRepository,
    private readonly bookingRepo: BookingRepository,
    private readonly drivers: DriversService,
    private readonly pricing: PricingService,
    private readonly dispatch: DispatchService,
    private readonly events: BookingEventsService,
    private readonly views: BookingViewsService,
    private readonly publisher: RealtimePublisher,
  ) {}

  expirePendingForBooking(
    bookingId: string,
    manager?: EntityManager,
  ): Promise<{ id: string; driverId: string }[]> {
    return this.offerRepo.expirePending(bookingId, manager);
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
    const pending = await this.offerRepo.findPendingByDriver(driverId);
    if (pending.length === 0) return [];
    const bookings = new Map(
      (await this.bookingRepo.findByIds(pending.map((o) => o.bookingId))).map((b) => [b.id, b]),
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
    const offer = await this.offerRepo.findOwnedByDriver(user.id, offerId);
    if (!offer) throw new NotFoundException('Offer not found');

    let withdrawn: { id: string; driverId: string }[];
    try {
      withdrawn = await this.ds.transaction(async (m) => {
        const status = await this.bookingRepo.lockStatus(offer.bookingId, m);
        const locked = await this.offerRepo.lockState(offerId, m);
        if (
          !status ||
          !locked ||
          status !== 'searching' ||
          locked.response !== 'pending' ||
          !locked.live
        ) {
          throw new ConflictException(NO_LONGER_AVAILABLE);
        }
        await this.offerRepo.markAccepted(offerId, m);
        const others = await this.expirePendingForBooking(offer.bookingId, m);
        await this.bookingRepo.assignDriver(offer.bookingId, user.id, m);
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
    const booking = await this.bookingRepo.findByIdOrFail(offer.bookingId);
    this.publisher.toCustomer(
      booking.customerId,
      REALTIME_EVENTS.bookingUpdated,
      await this.views.customerView(booking),
    );
    return this.views.driverView(booking);
  }

  async decline(user: AuthUser, offerId: string, input: DeclineOfferInput): Promise<void> {
    const declined = await this.offerRepo.declinePending(offerId, user.id, input.reason ?? null);
    if (!declined) {
      if ((await this.offerRepo.countOwnedByDriver(user.id, offerId)) === 0) {
        throw new NotFoundException('Offer not found');
      }
      throw new ConflictException(NO_LONGER_AVAILABLE);
    }

    await this.events.record(declined.bookingId, 'offer.declined', user, {
      offerId,
      reason: input.reason ?? null,
    });
    const pending = await this.offerRepo.countPendingInRound(declined.bookingId, declined.round);
    if (pending === 0) await this.dispatch.promoteRound(declined.bookingId, declined.round + 1);
  }
}
