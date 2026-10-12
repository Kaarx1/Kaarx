import { Injectable } from '@nestjs/common';
import {
  PHOTO_SIDES,
  type CustomerBookingView,
  type DriverBookingView,
  type PhotoPhase,
  type PhotoSide,
} from '@kaarx/shared';
import { DataSource } from 'typeorm';
import type { Booking } from '../../database/entities';
import { CustomersService } from '../customers/customers.service';
import { toPublicDriver } from '../drivers/driver.views';
import { DriversService } from '../drivers/drivers.service';
import { PricingService } from '../pricing/pricing.service';
import { toCustomerView, toDriverView } from './booking.views';

@Injectable()
export class BookingViewsService {
  constructor(
    private readonly ds: DataSource,
    private readonly drivers: DriversService,
    private readonly customers: CustomersService,
    private readonly pricing: PricingService,
  ) {}

  async customerView(b: Booking): Promise<CustomerBookingView> {
    const driver = b.driverId ? toPublicDriver(await this.drivers.getById(b.driverId)) : null;
    return toCustomerView(b, driver);
  }

  async customerViews(bookings: Booking[]): Promise<CustomerBookingView[]> {
    const ids = [...new Set(bookings.flatMap((b) => (b.driverId ? [b.driverId] : [])))];
    const drivers = ids.length > 0 ? await this.drivers.getManyByIds(ids) : [];
    const byId = new Map(drivers.map((d) => [d.id, toPublicDriver(d)]));
    return bookings.map((b) =>
      toCustomerView(b, b.driverId ? (byId.get(b.driverId) ?? null) : null),
    );
  }

  async driverView(b: Booking): Promise<DriverBookingView> {
    const [customer, photos, estimatedEarningPaise] = await Promise.all([
      this.customers.getContactCard(b.customerId),
      this.photosDone(b.id),
      this.pricing.driverEarningFor(b.pricingRuleId, b.estimatedFarePaise),
    ]);
    return toDriverView(b, { customer, photos, estimatedEarningPaise });
  }

  async photosDone(bookingId: string): Promise<{ preTrip: PhotoSide[]; postTrip: PhotoSide[] }> {
    const rows = (await this.ds.query(
      'select distinct phase, side from trip_photos where booking_id = $1',
      [bookingId],
    )) as { phase: PhotoPhase; side: PhotoSide }[];
    const sidesFor = (phase: PhotoPhase): PhotoSide[] =>
      PHOTO_SIDES.filter((side) => rows.some((row) => row.phase === phase && row.side === side));
    return { preTrip: sidesFor('pre_trip'), postTrip: sidesFor('post_trip') };
  }
}
