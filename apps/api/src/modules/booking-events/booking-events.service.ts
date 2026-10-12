import { Injectable } from '@nestjs/common';
import type { AdminBookingDetail } from '@kaarx/shared';
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthUser } from '../../common/auth/auth-user';

export type BookingEventView = AdminBookingDetail['events'][number];

@Injectable()
export class BookingEventsService {
  constructor(private readonly ds: DataSource) {}

  async record(
    bookingId: string,
    eventType: string,
    actor: AuthUser | null,
    payload: Record<string, unknown> = {},
    manager?: EntityManager,
  ): Promise<void> {
    await (manager ?? this.ds.manager).query(
      `insert into booking_events (booking_id, event_type, actor_type, actor_id, payload)
       values ($1, $2, $3, $4, $5::jsonb)`,
      [bookingId, eventType, actor?.role ?? null, actor?.id ?? null, JSON.stringify(payload)],
    );
  }

  async list(bookingId: string): Promise<BookingEventView[]> {
    const rows = (await this.ds.query(
      `select event_type as "eventType", actor_type as "actorType", actor_id as "actorId", payload,
              created_at as "createdAt"
         from booking_events
        where booking_id = $1
        order by created_at, id`,
      [bookingId],
    )) as (Omit<BookingEventView, 'createdAt'> & { createdAt: Date })[];
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }
}
