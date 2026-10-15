import { Injectable } from '@nestjs/common';
import type { LatLng } from '@kaarx/shared';
import { DataSource, EntityManager } from 'typeorm';

export interface ActiveZoneRow {
  zoneId: string;
  cityId: string;
}

@Injectable()
export class ZoneRepository {
  constructor(private readonly dataSource: DataSource) {}

  private manager(manager?: EntityManager) {
    return manager ?? this.dataSource.manager;
  }

  async findActiveAt(point: LatLng, manager?: EntityManager): Promise<ActiveZoneRow | null> {
    const rows = (await this.manager(manager).query(
      `select z.id as "zoneId", z.city_id as "cityId"
         from zones z
         join cities c on c.id = z.city_id
        where z.is_active and c.is_active
          and ST_Covers(z.area, ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography)
        order by z.created_at
        limit 1`,
      [point.lng, point.lat],
    )) as ActiveZoneRow[];
    return rows[0] ?? null;
  }

  async hasPointWithinDestinationRadius(
    zoneId: string,
    point: LatLng,
    manager?: EntityManager,
  ): Promise<boolean> {
    const rows = (await this.manager(manager).query(
      `select ST_DWithin(
                z.area,
                ST_SetSRID(ST_MakePoint($2::float8, $3::float8), 4326)::geography,
                (z.destination_radius_km * 1000)::float8
              ) as "within"
         from zones z
        where z.id = $1`,
      [zoneId, point.lng, point.lat],
    )) as { within: boolean }[];
    return rows[0]?.within === true;
  }

  async findActiveCityIds(manager?: EntityManager): Promise<string[]> {
    const rows = (await this.manager(manager).query(
      'select id from cities where is_active order by name',
    )) as { id: string }[];
    return rows.map((row) => row.id);
  }
}
