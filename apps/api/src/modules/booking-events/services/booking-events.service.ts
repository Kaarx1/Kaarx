import { Injectable } from '@nestjs/common';
import type { AdminBookingDetail } from '@kaarx/shared';
import type { EntityManager } from 'typeorm';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BookingEventRepository } from '../../../database/repositories';

export type BookingEventView = AdminBookingDetail['events'][number];

@Injectable()
export class BookingEventsService {
  constructor(private readonly eventRepo: BookingEventRepository) {}

  record(
    bookingId: string,
    eventType: string,
    actor: AuthUser | null,
    payload: Record<string, unknown> = {},
    manager?: EntityManager,
  ): Promise<void> {
    return this.eventRepo.insert(
      {
        bookingId,
        eventType,
        actorType: actor?.role ?? null,
        actorId: actor?.id ?? null,
        payload,
      },
      manager,
    );
  }

  async list(bookingId: string): Promise<BookingEventView[]> {
    const rows = await this.eventRepo.findByBooking(bookingId);
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }
}
