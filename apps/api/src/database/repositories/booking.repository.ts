import { Injectable } from '@nestjs/common';
import { LIVE_BOOKING_STATUSES, type BookingStatus, type Role } from '@kaarx/shared';
import { DataSource, EntityManager, In, Not, type QueryDeepPartialEntity } from 'typeorm';
import { Booking } from '../entities';

const ACTIVE_STATUSES: BookingStatus[] = ['searching', ...LIVE_BOOKING_STATUSES];
const RECENT_LIMIT = 20;

export interface BookingDispatchStateRow {
  status: BookingStatus;
  dispatchRound: number;
}

export interface AdminBookingSearch {
  status: BookingStatus | null;
  code: string | null;
  vehicleNumber: string | null;
  phone: string | null;
}

export interface AdminBookingPageRow {
  id: string;
  code: string;
  status: BookingStatus;
  created_at: Date;
  pickup_address: string;
  dropoff_address: string;
  estimated_fare_paise: number;
  final_fare_paise: number | null;
  customer_name: string | null;
  customer_phone: string;
  driver_name: string | null;
  driver_phone: string | null;
  vehicle_number: string;
}

@Injectable()
export class BookingRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo(manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).getRepository(Booking);
  }

  findById(id: string, manager?: EntityManager): Promise<Booking | null> {
    return this.repo(manager).findOneBy({ id });
  }

  findByIdOrFail(id: string, manager?: EntityManager): Promise<Booking> {
    return this.repo(manager).findOneByOrFail({ id });
  }

  findByIds(ids: string[], manager?: EntityManager): Promise<Booking[]> {
    return this.repo(manager).findBy({ id: In(ids) });
  }

  findOwnedByCustomer(
    customerId: string,
    bookingId: string,
    manager?: EntityManager,
  ): Promise<Booking | null> {
    return this.repo(manager).findOneBy({ id: bookingId, customerId });
  }

  findOwnedByDriver(
    driverId: string,
    bookingId: string,
    manager?: EntityManager,
  ): Promise<Booking | null> {
    return this.repo(manager).findOneBy({ id: bookingId, driverId });
  }

  existsOwned(
    owner: { role: Role; id: string },
    bookingId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    return this.repo(manager).existsBy(
      owner.role === 'driver'
        ? { id: bookingId, driverId: owner.id }
        : { id: bookingId, customerId: owner.id },
    );
  }

  findRecentByCustomer(
    customerId: string,
    active: boolean,
    manager?: EntityManager,
  ): Promise<Booking[]> {
    return this.repo(manager).find({
      where: { customerId, status: active ? In(ACTIVE_STATUSES) : Not(In(ACTIVE_STATUSES)) },
      order: { createdAt: 'DESC' },
      take: RECENT_LIMIT,
    });
  }

  findCurrentByDriver(driverId: string, manager?: EntityManager): Promise<Booking | null> {
    return this.repo(manager).findOne({
      where: [
        { driverId, status: In([...LIVE_BOOKING_STATUSES]) },
        { driverId, status: 'completed', paymentStatus: 'unpaid' },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  findLiveByDriver(
    driverId: string,
    manager?: EntityManager,
  ): Promise<Pick<Booking, 'id' | 'customerId'> | null> {
    return this.repo(manager).findOne({
      select: { id: true, customerId: true },
      where: { driverId, status: In([...LIVE_BOOKING_STATUSES]) },
    });
  }

  lockByIdOrFail(id: string, manager: EntityManager): Promise<Booking> {
    return this.repo(manager).findOneOrFail({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  lockOwnedByDriver(
    driverId: string,
    bookingId: string,
    manager: EntityManager,
  ): Promise<Booking | null> {
    return this.repo(manager).findOne({
      where: { id: bookingId, driverId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  async lockStatus(id: string, manager: EntityManager): Promise<BookingStatus | null> {
    const rows = (await manager.query('select status from bookings where id = $1 for update', [
      id,
    ])) as { status: BookingStatus }[];
    return rows[0]?.status ?? null;
  }

  async lockDispatchState(
    id: string,
    manager: EntityManager,
  ): Promise<BookingDispatchStateRow | null> {
    const rows = (await manager.query(
      'select status, dispatch_round as "dispatchRound" from bookings where id = $1 for update',
      [id],
    )) as BookingDispatchStateRow[];
    return rows[0] ?? null;
  }

  async insert(values: QueryDeepPartialEntity<Booking>, manager?: EntityManager): Promise<string> {
    const inserted = await this.repo(manager).insert(values);
    return String(inserted.identifiers[0]?.['id']);
  }

  async update(id: string, fields: Partial<Booking>, manager?: EntityManager): Promise<void> {
    await this.repo(manager).update(id, fields);
  }

  async assignDriver(id: string, driverId: string, manager?: EntityManager): Promise<void> {
    await (manager ?? this.dataSource.manager).query(
      `update bookings set status = 'assigned', driver_id = $2, assigned_at = now() where id = $1`,
      [id, driverId],
    );
  }

  async advanceDispatchRound(id: string, round: number, manager?: EntityManager): Promise<boolean> {
    const [updated] = (await (manager ?? this.dataSource.manager).query(
      `update bookings set dispatch_round = $2
        where id = $1 and status = 'searching' and dispatch_round = $3
        returning id`,
      [id, round, round - 1],
    )) as [{ id: string }[], number];
    return updated.length > 0;
  }

  async markNoDriverFound(id: string, manager?: EntityManager): Promise<boolean> {
    const [updated] = (await (manager ?? this.dataSource.manager).query(
      `update bookings set status = 'no_driver_found' where id = $1 and status = 'searching' returning id`,
      [id],
    )) as [{ id: string }[], number];
    return updated.length > 0;
  }

  findAdminPage(
    search: AdminBookingSearch,
    limit: number,
    manager?: EntityManager,
  ): Promise<AdminBookingPageRow[]> {
    return (manager ?? this.dataSource.manager).query(
      `select b.id, b.code, b.status, b.created_at, b.pickup_address, b.dropoff_address,
              b.estimated_fare_paise, b.final_fare_paise,
              c.full_name as customer_name, c.phone as customer_phone,
              d.full_name as driver_name, d.phone as driver_phone,
              b.vehicle_snapshot->>'registrationNumber' as vehicle_number
         from bookings b
         join customers c on c.id = b.customer_id
         left join drivers d on d.id = b.driver_id
        where ($1::booking_status is null or b.status = $1::booking_status)
          and ($2::text is null
               or b.code ilike $2::text
               or b.vehicle_snapshot->>'registrationNumber' like $3::text
               or c.phone like $4::text)
        order by b.created_at desc
        limit ${limit}`,
      [search.status, search.code, search.vehicleNumber, search.phone],
    );
  }
}
