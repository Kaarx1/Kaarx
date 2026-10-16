import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  REALTIME_EVENTS,
  type DriverLocationEvent,
  type LatLng,
  type LocationPointInput,
  type OnlineDriverView,
} from '@kaarx/shared';
import { DriverLocationRepository, DriverSessionRepository } from '../../../database/repositories';
import { DriversService } from '../../drivers/services/drivers.service';
import { ZonesService } from '../../geo/services/zones.service';
import { RealtimePublisher } from '../../realtime/realtime.publisher';
import { PresenceStore } from '../presence.store';

@Injectable()
export class PresenceService {
  constructor(
    private readonly sessionRepo: DriverSessionRepository,
    private readonly locationRepo: DriverLocationRepository,
    private readonly drivers: DriversService,
    private readonly zones: ZonesService,
    private readonly store: PresenceStore,
    private readonly publisher: RealtimePublisher,
  ) {}

  async goOnline(driverId: string, point: LatLng): Promise<{ online: true; zoneId: string }> {
    await this.drivers.assertCanDrive(driverId);
    const zone = await this.zones.findActiveZoneAt(point);
    if (!zone) throw new UnprocessableEntityException('You are outside the Kaarx service area');
    await this.sessionRepo.openSession(driverId, zone.zoneId);
    await this.store.setOnline(driverId, { cityId: zone.cityId, zoneId: zone.zoneId }, point);
    return { online: true, zoneId: zone.zoneId };
  }

  async goOffline(driverId: string): Promise<void> {
    if (await this.drivers.findLiveBooking(driverId)) {
      throw new ConflictException('Finish your current trip before going offline');
    }
    await this.sessionRepo.closeOpenSession(driverId);
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

    await this.locationRepo.insertMany(driverId, live?.bookingId ?? null, sorted);

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
    const cityIds = await this.zones.findActiveCityIds();
    const online = (
      await Promise.all(cityIds.map((cityId) => this.store.listOnline(cityId)))
    ).flat();
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
