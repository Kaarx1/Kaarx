import { Inject, Injectable } from '@nestjs/common';
import type { LatLng } from '@kaarx/shared';
import type { Redis } from 'ioredis';
import { REDIS } from '../../common/redis.module';

export interface PresenceState {
  cityId: string;
  zoneId: string;
}

export const PRESENCE_FRESH_MS = 90_000;

const geoKey = (cityId: string): string => `drivers:geo:${cityId}`;
const seenKey = (cityId: string): string => `drivers:seen:${cityId}`;
const stateKey = (driverId: string): string => `driver:state:${driverId}`;

@Injectable()
export class PresenceStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async setOnline(driverId: string, state: PresenceState, point: LatLng): Promise<void> {
    await this.redis
      .multi()
      .hset(stateKey(driverId), { cityId: state.cityId, zoneId: state.zoneId })
      .geoadd(geoKey(state.cityId), point.lng, point.lat, driverId)
      .zadd(seenKey(state.cityId), Date.now(), driverId)
      .exec();
  }

  async updatePosition(driverId: string, cityId: string, point: LatLng): Promise<void> {
    await this.redis
      .multi()
      .geoadd(geoKey(cityId), point.lng, point.lat, driverId)
      .zadd(seenKey(cityId), Date.now(), driverId)
      .exec();
  }

  async setOffline(driverId: string): Promise<void> {
    const state = await this.getState(driverId);
    const tx = this.redis.multi().del(stateKey(driverId));
    if (state) tx.zrem(geoKey(state.cityId), driverId).zrem(seenKey(state.cityId), driverId);
    await tx.exec();
  }

  async getState(driverId: string): Promise<PresenceState | null> {
    const { cityId, zoneId } = await this.redis.hgetall(stateKey(driverId));
    return cityId && zoneId ? { cityId, zoneId } : null;
  }

  async findNearby(
    cityId: string,
    point: LatLng,
    radiusKm: number,
    limit = 50,
  ): Promise<{ driverId: string; distanceM: number }[]> {
    const hits = (await this.redis.call(
      'GEOSEARCH',
      geoKey(cityId),
      'FROMLONLAT',
      point.lng,
      point.lat,
      'BYRADIUS',
      radiusKm,
      'km',
      'ASC',
      'COUNT',
      limit,
      'WITHDIST',
    )) as [string, string][];
    if (hits.length === 0) return [];
    const seen = await this.redis.zmscore(seenKey(cityId), ...hits.map(([driverId]) => driverId));
    const freshAfter = Date.now() - PRESENCE_FRESH_MS;
    return hits.flatMap(([driverId, distanceKm], i) =>
      Number(seen[i] ?? 0) >= freshAfter
        ? [{ driverId, distanceM: Math.round(Number(distanceKm) * 1000) }]
        : [],
    );
  }

  async listOnline(
    cityId: string,
  ): Promise<{ driverId: string; lat: number; lng: number; lastSeenAt: Date }[]> {
    const flat = await this.redis.zrange(seenKey(cityId), 0, -1, 'WITHSCORES');
    const seen: { driverId: string; ms: number }[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2)
      seen.push({ driverId: String(flat[i]), ms: Number(flat[i + 1]) });
    if (seen.length === 0) return [];
    const positions = await this.redis.geopos(geoKey(cityId), ...seen.map((s) => s.driverId));
    return seen.flatMap((s, i) => {
      const position = positions[i];
      return position
        ? [
            {
              driverId: s.driverId,
              lng: Number(position[0]),
              lat: Number(position[1]),
              lastSeenAt: new Date(s.ms),
            },
          ]
        : [];
    });
  }
}
