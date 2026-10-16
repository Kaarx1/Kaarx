import { Injectable } from '@nestjs/common';
import type { BookingStatus, Role } from '@kaarx/shared';
import { DataSource, EntityManager } from 'typeorm';

export interface SosRow {
  id: string;
  status: 'open' | 'handled';
  created_at: Date;
  notes: string | null;
  raised_by_type: Role;
  raised_by_id: string;
  raised_by_name: string | null;
  raised_by_phone: string | null;
  booking_id: string | null;
  booking_code: string | null;
  booking_status: BookingStatus | null;
  lat: number | null;
  lng: number | null;
}

const SOS_VIEW_SQL = `
  select s.id, s.status, s.created_at, s.notes, s.raised_by_type, s.raised_by_id,
         coalesce(c.full_name, d.full_name) as raised_by_name,
         coalesce(c.phone, d.phone) as raised_by_phone,
         b.id as booking_id, b.code as booking_code, b.status as booking_status,
         ST_Y(s.location::geometry) as lat, ST_X(s.location::geometry) as lng
    from sos_events s
    left join customers c on s.raised_by_type = 'customer' and c.id = s.raised_by_id
    left join drivers d on s.raised_by_type = 'driver' and d.id = s.raised_by_id
    left join bookings b on b.id = s.booking_id`;

@Injectable()
export class SosEventRepository {
  constructor(private readonly dataSource: DataSource) {}

  private manager(manager?: EntityManager) {
    return manager ?? this.dataSource.manager;
  }

  async insert(
    event: {
      bookingId: string | null;
      raisedByType: Role;
      raisedById: string;
      lat: number | null;
      lng: number | null;
    },
    manager?: EntityManager,
  ): Promise<string | null> {
    const rows: { id: string }[] = await this.manager(manager).query(
      `insert into sos_events (booking_id, raised_by_type, raised_by_id, location)
       values ($1, $2::party_type, $3,
               case when $4::float8 is null or $5::float8 is null then null
                    else ST_SetSRID(ST_MakePoint($5::float8, $4::float8), 4326)::geography end)
       returning id`,
      [event.bookingId, event.raisedByType, event.raisedById, event.lat, event.lng],
    );
    return rows[0]?.id ?? null;
  }

  async findById(id: string, manager?: EntityManager): Promise<SosRow | null> {
    const rows: SosRow[] = await this.manager(manager).query(`${SOS_VIEW_SQL} where s.id = $1`, [
      id,
    ]);
    return rows[0] ?? null;
  }

  findOpen(manager?: EntityManager): Promise<SosRow[]> {
    return this.manager(manager).query(
      `${SOS_VIEW_SQL} where s.status = 'open' order by s.created_at desc limit 100`,
    );
  }

  async existsById(id: string, manager?: EntityManager): Promise<boolean> {
    const rows: { id: string }[] = await this.manager(manager).query(
      `select id from sos_events where id = $1`,
      [id],
    );
    return rows.length > 0;
  }

  async markHandled(
    id: string,
    adminId: string,
    notes: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const [updated]: [{ id: string }[], number] = await this.manager(manager).query(
      `update sos_events set status = 'handled', handled_by = $2, handled_at = now(), notes = $3
        where id = $1 and status = 'open' returning id`,
      [id, adminId, notes],
    );
    return updated.length > 0;
  }
}
