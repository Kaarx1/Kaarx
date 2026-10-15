import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  REALTIME_EVENTS,
  type DriverLocationEvent,
  type LatLng,
  type LocationPointInput,
  type OnlineDriverView,
} from '@kaarx/shared';
import { DataSource } from 'typeorm';
import { DriversService } from '../../drivers/services/drivers.service';
import { ZonesService } from '../../geo/services/zones.service';
import { RealtimePublisher } from '../../realtime/realtime.publisher';
import { PresenceStore } from '../presence.store';

@Injectable()
export class PresenceService {
  constructor(
    private readonly ds: DataSource,
    private readonly drivers: DriversService,
    private readonly zones: ZonesService,
    private readonly store: PresenceStore,
    private readonly publisher: RealtimePublisher,
  ) {}

  async goOnline(driverId: string, point: LatLng): Promise<{ online: true; zoneId: string }> {
    await this.drivers.assertCanDrive(driverId);
    const zone = await this.zones.findActiveZoneAt(point);
    if (!zone) throw new UnprocessableEntityException('You are outside the Kaarx service area');
    await this.ds.query(
      `insert into driver_sessions (driver_id, zone_id) values ($1, $2)
       on conflict (driver_id) where went_offline_at is null do nothing`,
      [driverId, zone.zoneId],
    );
    await this.store.setOnline(driverId, { cityId: zone.cityId, zoneId: zone.zoneId }, point);
    return { online: true, zoneId: zone.zoneId };
  }

  async goOffline(driverId: string): Promise<void> {
    if (await this.drivers.findLiveBooking(driverId)) {
      throw new ConflictException('Finish your current trip before going offline');
    }
    await this.ds.query(
      'update driver_sessions set went_offline_at = now() where driver_id = $1 and went_offline_at is null',
      [driverId],
    );
    await this.store.setOffline(driverId);
  }

  async recordLocations(
    driverId: string,
    points: LocationPointInput[],
  ): Promise<{ accepted: number }> {
    const sorted = [...points].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
    const latest = sorted[sorted.length - 1];
    if (!latest) return { accepted: 0 };

    const [state, live] = await Promise.all([
      this.store.getState(driverId),
      this.drivers.findLiveBooking(driverId),
    ]);
    if (!state && !live) return { accepted: 0 };
    if (state) await this.store.updatePosition(driverId, state.cityId, latest);

    await this.ds.query(
      `insert into driver_locations (driver_id, booking_id, recorded_at, location, speed_mps, heading, accuracy_m)
       select $1, $2, t.recorded_at, ST_SetSRID(ST_MakePoint(t.lng, t.lat), 4326)::geography, t.speed, t.heading, t.accuracy
         from unnest($3::timestamptz[], $4::float8[], $5::float8[], $6::real[], $7::real[], $8::real[])
           as t(recorded_at, lat, lng, speed, heading, accuracy)`,
      [
        driverId,
        live?.bookingId ?? null,
        sorted.map((p) => p.recordedAt),
        sorted.map((p) => p.lat),
        sorted.map((p) => p.lng),
        sorted.map((p) => p.speedMps ?? null),
        sorted.map((p) => p.heading ?? null),
        sorted.map((p) => p.accuracyM ?? null),
      ],
    );

    if (live) {
      const event: DriverLocationEvent = {
        bookingId: live.bookingId,
        lat: latest.lat,
        lng: latest.lng,
        heading: latest.heading ?? null,
        recordedAt: latest.recordedAt.toISOString(),
      };
      this.publisher.toCustomer(live.customerId, REALTIME_EVENTS.driverLocation, event);
    }
    return { accepted: sorted.length };
  }

  async listOnlineDrivers(): Promise<OnlineDriverView[]> {
    const cities = (await this.ds.query('select id from cities where is_active order by name')) as {
      id: string;
    }[];
    const online = (await Promise.all(cities.map((city) => this.store.listOnline(city.id)))).flat();
    if (online.length === 0) return [];
    const drivers = new Map(
      (await this.drivers.getManyByIds(online.map((o) => o.driverId))).map((d) => [d.id, d]),
    );
    return online.flatMap((o) => {
      const driver = drivers.get(o.driverId);
      return driver
        ? [
            {
              driverId: driver.id,
              code: driver.code,
              fullName: driver.fullName,
              phone: driver.phone,
              lat: o.lat,
              lng: o.lng,
              lastSeenAt: o.lastSeenAt.toISOString(),
            },
          ]
        : [];
    });
  }
}
