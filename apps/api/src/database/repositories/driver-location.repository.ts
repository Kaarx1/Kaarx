import { Injectable } from '@nestjs/common';
import type { LocationPointInput } from '@kaarx/shared';
import { DataSource, EntityManager } from 'typeorm';

@Injectable()
export class DriverLocationRepository {
  constructor(private readonly dataSource: DataSource) {}

  private manager(manager?: EntityManager) {
    return manager ?? this.dataSource.manager;
  }

  async insertMany(
    driverId: string,
    bookingId: string | null,
    points: LocationPointInput[],
    manager?: EntityManager,
  ): Promise<void> {
    await this.manager(manager).query(
      `insert into driver_locations (driver_id, booking_id, recorded_at, location, speed_mps, heading, accuracy_m)
       select $1, $2, t.recorded_at, ST_SetSRID(ST_MakePoint(t.lng, t.lat), 4326)::geography, t.speed, t.heading, t.accuracy
         from unnest($3::timestamptz[], $4::float8[], $5::float8[], $6::real[], $7::real[], $8::real[])
           as t(recorded_at, lat, lng, speed, heading, accuracy)`,
      [
        driverId,
        bookingId,
        points.map((p) => p.recordedAt),
        points.map((p) => p.lat),
        points.map((p) => p.lng),
        points.map((p) => p.speedMps ?? null),
        points.map((p) => p.heading ?? null),
        points.map((p) => p.accuracyM ?? null),
      ],
    );
  }

  async getTracedDistance(
    bookingId: string,
    driverId: string,
    since: Date,
    manager?: EntityManager,
  ): Promise<{ points: number; meters: number }> {
    const rows: { points: number; meters: number | null }[] = await this.manager(manager).query(
      `select count(*)::int as points,
              case when count(*) >= 2
                   then ST_Length(ST_MakeLine(location::geometry order by recorded_at)::geography)
              end as meters
         from driver_locations
        where booking_id = $1 and driver_id = $2 and recorded_at >= $3`,
      [bookingId, driverId, since],
    );
    return { points: rows[0]?.points ?? 0, meters: rows[0]?.meters ?? 0 };
  }
}
