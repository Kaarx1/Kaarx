import { Injectable } from '@nestjs/common';
import type { Role } from '@kaarx/shared';
import { DataSource, EntityManager } from 'typeorm';

export interface BookingEventRow {
  eventType: string;
  actorType: Role | null;
  actorId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
}

@Injectable()
export class BookingEventRepository {
  constructor(private readonly dataSource: DataSource) {}

  private manager(manager?: EntityManager) {
    return manager ?? this.dataSource.manager;
  }

  async insert(
    event: {
      bookingId: string;
      eventType: string;
      actorType: Role | null;
      actorId: string | null;
      payload: Record<string, unknown>;
    },
    manager?: EntityManager,
  ): Promise<void> {
    await this.manager(manager).query(
      `insert into booking_events (booking_id, event_type, actor_type, actor_id, payload)
       values ($1, $2, $3, $4, $5::jsonb)`,
      [
        event.bookingId,
        event.eventType,
        event.actorType,
        event.actorId,
        JSON.stringify(event.payload),
      ],
    );
  }

  async findByBooking(bookingId: string, manager?: EntityManager): Promise<BookingEventRow[]> {
    return (await this.manager(manager).query(
      `select event_type as "eventType", actor_type as "actorType", actor_id as "actorId", payload,
              created_at as "createdAt"
         from booking_events
        where booking_id = $1
        order by created_at, id`,
      [bookingId],
    )) as BookingEventRow[];
  }
}
