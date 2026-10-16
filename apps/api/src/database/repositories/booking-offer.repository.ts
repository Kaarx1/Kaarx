import { Injectable } from '@nestjs/common';
import type { OfferResponse } from '@kaarx/shared';
import { DataSource, EntityManager } from 'typeorm';
import { BookingOffer } from '../entities';

export interface OfferStateRow {
  response: OfferResponse;
  live: boolean;
}

export interface ExpiredOfferRow {
  id: string;
  driverId: string;
}

export interface DeclinedOfferRow {
  bookingId: string;
  round: number;
}

export interface OfferDetailRow {
  driver_id: string;
  driver_name: string;
  round: number;
  response: OfferResponse;
  distance_to_pickup_m: number | null;
  offered_at: Date;
  responded_at: Date | null;
}

@Injectable()
export class BookingOfferRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo(manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).getRepository(BookingOffer);
  }

  findOwnedByDriver(
    driverId: string,
    offerId: string,
    manager?: EntityManager,
  ): Promise<BookingOffer | null> {
    return this.repo(manager).findOneBy({ id: offerId, driverId });
  }

  findPendingByDriver(driverId: string, manager?: EntityManager): Promise<BookingOffer[]> {
    return this.repo(manager)
      .createQueryBuilder('o')
      .where('o.driverId = :driverId', { driverId })
      .andWhere(`o.response = 'pending'`)
      .andWhere('o.expiresAt > now()')
      .orderBy('o.offeredAt', 'DESC')
      .getMany();
  }

  findPendingInRound(
    bookingId: string,
    round: number,
    manager?: EntityManager,
  ): Promise<BookingOffer[]> {
    return this.repo(manager).findBy({ bookingId, round, response: 'pending' });
  }

  findByBooking(bookingId: string, manager?: EntityManager): Promise<OfferDetailRow[]> {
    return (manager ?? this.dataSource.manager).query(
      `select o.driver_id, d.full_name as driver_name, o.round, o.response, o.distance_to_pickup_m,
              o.offered_at, o.responded_at
         from booking_offers o join drivers d on d.id = o.driver_id
        where o.booking_id = $1 order by o.round, o.offered_at`,
      [bookingId],
    );
  }

  countOwnedByDriver(driverId: string, offerId: string, manager?: EntityManager): Promise<number> {
    return this.repo(manager).countBy({ id: offerId, driverId });
  }

  async countPendingInRound(
    bookingId: string,
    round: number,
    manager?: EntityManager,
  ): Promise<number> {
    const rows = (await (manager ?? this.dataSource.manager).query(
      `select count(*)::int as "pending" from booking_offers
        where booking_id = $1 and round = $2 and response = 'pending'`,
      [bookingId, round],
    )) as { pending: number }[];
    return rows[0]?.pending ?? 0;
  }

  async lockState(offerId: string, manager: EntityManager): Promise<OfferStateRow | null> {
    const rows = (await manager.query(
      'select response, expires_at > now() as "live" from booking_offers where id = $1 for update',
      [offerId],
    )) as OfferStateRow[];
    return rows[0] ?? null;
  }

  async insertMany(
    bookingId: string,
    round: number,
    timeoutSec: number,
    candidates: { driverId: string; distanceM: number }[],
    manager?: EntityManager,
  ): Promise<void> {
    await (manager ?? this.dataSource.manager).query(
      `insert into booking_offers (booking_id, driver_id, round, distance_to_pickup_m, expires_at)
       select $1, t.driver_id, $2, t.distance_m, now() + make_interval(secs => $3::float8)
         from unnest($4::uuid[], $5::int[]) as t(driver_id, distance_m)`,
      [
        bookingId,
        round,
        timeoutSec,
        candidates.map((c) => c.driverId),
        candidates.map((c) => c.distanceM),
      ],
    );
  }

  async markAccepted(offerId: string, manager?: EntityManager): Promise<void> {
    await (manager ?? this.dataSource.manager).query(
      `update booking_offers set response = 'accepted', responded_at = now() where id = $1`,
      [offerId],
    );
  }

  async declinePending(
    offerId: string,
    driverId: string,
    reason: string | null,
    manager?: EntityManager,
  ): Promise<DeclinedOfferRow | null> {
    const [rows] = (await (manager ?? this.dataSource.manager).query(
      `update booking_offers set response = 'declined', responded_at = now(), decline_reason = $3
        where id = $1 and driver_id = $2 and response = 'pending'
        returning booking_id as "bookingId", round`,
      [offerId, driverId, reason],
    )) as [DeclinedOfferRow[], number];
    return rows[0] ?? null;
  }

  async declineAccepted(
    bookingId: string,
    driverId: string,
    reason: string,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager ?? this.dataSource.manager).query(
      `update booking_offers set response = 'declined', responded_at = now(), decline_reason = $3
      where booking_id = $1 and driver_id = $2 and response = 'accepted'`,
      [bookingId, driverId, reason],
    );
  }

  async expirePending(bookingId: string, manager?: EntityManager): Promise<ExpiredOfferRow[]> {
    const [rows] = (await (manager ?? this.dataSource.manager).query(
      `update booking_offers set response = 'expired', responded_at = now()
        where booking_id = $1 and response = 'pending'
        returning id, driver_id as "driverId"`,
      [bookingId],
    )) as [ExpiredOfferRow[], number];
    return rows;
  }
}
