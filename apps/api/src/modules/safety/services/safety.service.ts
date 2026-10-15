import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  REALTIME_EVENTS,
  type BookingStatus,
  type Role,
  type SosAdminView,
  type SosInput,
} from '@kaarx/shared';
import { AuditService } from '../../../common/audit/audit.service';
import type { AuthUser } from '../../../common/auth/auth-user';
import { Booking } from '../../../database/entities';
import { BookingEventsService } from '../../booking-events/services/booking-events.service';
import { RealtimePublisher } from '../../realtime/realtime.publisher';

interface SosRow {
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

function toSosView(row: SosRow): SosAdminView {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    raisedBy: {
      type: row.raised_by_type,
      id: row.raised_by_id,
      name: row.raised_by_name ?? 'Customer',
      phone: row.raised_by_phone ?? '',
    },
    booking:
      row.booking_id && row.booking_code && row.booking_status
        ? { id: row.booking_id, code: row.booking_code, status: row.booking_status }
        : null,
    location: row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null,
    notes: row.notes,
  };
}

@Injectable()
export class SafetyService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly events: BookingEventsService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async raise(user: AuthUser, input: SosInput): Promise<{ id: string }> {
    if (input.bookingId) await this.requireOwnBooking(user, input.bookingId);
    const id = await this.ds.transaction(async (manager) => {
      const rows: { id: string }[] = await manager.query(
        `insert into sos_events (booking_id, raised_by_type, raised_by_id, location)
         values ($1, $2::party_type, $3,
                 case when $4::float8 is null or $5::float8 is null then null
                      else ST_SetSRID(ST_MakePoint($5::float8, $4::float8), 4326)::geography end)
         returning id`,
        [input.bookingId ?? null, user.role, user.id, input.lat ?? null, input.lng ?? null],
      );
      const sosId = rows[0]?.id;
      if (!sosId) throw new Error('SOS insert returned no id');
      if (input.bookingId)
        await this.events.record(input.bookingId, 'sos.raised', user, { sosId }, manager);
      return sosId;
    });
    this.realtime.toAdmins(REALTIME_EVENTS.sosRaised, await this.getView(id));
    return { id };
  }

  async listOpen(): Promise<SosAdminView[]> {
    const rows: SosRow[] = await this.ds.query(
      `${SOS_VIEW_SQL} where s.status = 'open' order by s.created_at desc limit 100`,
    );
    return rows.map(toSosView);
  }

  async handle(admin: AuthUser, id: string, notes: string): Promise<SosAdminView> {
    await this.ds.transaction(async (manager) => {
      const [updated]: [{ id: string }[], number] = await manager.query(
        `update sos_events set status = 'handled', handled_by = $2, handled_at = now(), notes = $3
          where id = $1 and status = 'open' returning id`,
        [id, admin.id, notes],
      );
      if (updated.length === 0) {
        const existing: { id: string }[] = await manager.query(
          `select id from sos_events where id = $1`,
          [id],
        );
        if (existing.length === 0) throw new NotFoundException('SOS not found');
        throw new ConflictException('This SOS has already been handled');
      }
      await this.audit.record(
        {
          adminId: admin.id,
          action: 'sos.handle',
          entityType: 'sos_event',
          entityId: id,
          before: { status: 'open' },
          after: { status: 'handled', notes },
        },
        manager,
      );
    });
    return this.getView(id);
  }

  private async requireOwnBooking(user: AuthUser, bookingId: string): Promise<void> {
    const where =
      user.role === 'driver'
        ? { id: bookingId, driverId: user.id }
        : { id: bookingId, customerId: user.id };
    const booking = await this.bookings.findOne({ where, select: { id: true } });
    if (!booking) throw new NotFoundException('Booking not found');
  }

  private async getView(id: string): Promise<SosAdminView> {
    const rows: SosRow[] = await this.ds.query(`${SOS_VIEW_SQL} where s.id = $1`, [id]);
    const row = rows[0];
    if (!row) throw new NotFoundException('SOS not found');
    return toSosView(row);
  }
}
