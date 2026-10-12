import { Injectable } from '@nestjs/common';
import type { LatLng } from '@kaarx/shared';
import { DataSource } from 'typeorm';

@Injectable()
export class ZonesService {
  constructor(private readonly ds: DataSource) {}

  async findActiveZoneAt(point: LatLng): Promise<{ zoneId: string; cityId: string } | null> {
    const rows = (await this.ds.query(
      `select z.id as "zoneId", z.city_id as "cityId"
         from zones z
         join cities c on c.id = z.city_id
        where z.is_active and c.is_active
          and ST_Covers(z.area, ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography)
        order by z.created_at
        limit 1`,
      [point.lng, point.lat],
    )) as { zoneId: string; cityId: string }[];
    return rows[0] ?? null;
  }

  async isWithinDestinationRadius(zoneId: string, point: LatLng): Promise<boolean> {
    const rows = (await this.ds.query(
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
}
