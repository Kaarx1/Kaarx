import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  LIVE_BOOKING_STATUSES,
  type VehicleSnapshot,
  type VerificationStatus,
} from '@kaarx/shared';
import { Booking, Driver } from '../entities';

@Injectable()
export class DriverRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo(manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).getRepository(Driver);
  }

  findById(id: string, manager?: EntityManager): Promise<Driver | null> {
    return this.repo(manager).findOneBy({ id });
  }

  findByIds(ids: string[], manager?: EntityManager): Promise<Driver[]> {
    return this.repo(manager).findBy({ id: In(ids) });
  }

  findRecent(status?: VerificationStatus, manager?: EntityManager): Promise<Driver[]> {
    return this.repo(manager).find({
      where: status ? { verificationStatus: status } : {},
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async insert(values: Partial<Driver>, manager?: EntityManager): Promise<void> {
    await this.repo(manager).insert(values);
  }

  async update(id: string, fields: Partial<Driver>, manager?: EntityManager): Promise<void> {
    await this.repo(manager).update(id, fields);
  }

  async incrementTotalTrips(id: string, manager?: EntityManager): Promise<void> {
    await this.repo(manager).increment({ id }, 'totalTrips', 1);
  }

  async findEligibleIdsForOffer(
    candidateIds: string[],
    vehicle: VehicleSnapshot,
    bookingId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    const rows: { id: string }[] = await (manager ?? this.dataSource.manager).query(
      `select d.id
         from drivers d
        where d.id = any($1::uuid[])
          and d.status = 'active'
          and d.verification_status = 'approved'
          and (d.suspended_until is null or d.suspended_until <= now())
          and (d.transmission = 'both' or d.transmission::text = $2)
          and $3::vehicle_body_type = any(d.body_types)
          and ($4::text <> 'electric' or d.ev_experience)
          and not exists (
                select 1 from bookings b
                 where b.driver_id = d.id and b.status = any($5::booking_status[]))
          and not exists (
                select 1 from booking_offers o
                 where o.driver_id = d.id and o.booking_id = $6)
          and not exists (
                select 1 from booking_offers o
                 where o.driver_id = d.id and o.response = 'pending' and o.expires_at > now())`,
      [
        candidateIds,
        vehicle.transmission,
        vehicle.bodyType,
        vehicle.fuel,
        [...LIVE_BOOKING_STATUSES],
        bookingId,
      ],
    );
    return rows.map((row) => row.id);
  }

  findLiveBookingByDriver(
    driverId: string,
    manager?: EntityManager,
  ): Promise<Pick<Booking, 'id' | 'customerId'> | null> {
    return (manager ?? this.dataSource.manager).getRepository(Booking).findOne({
      select: { id: true, customerId: true },
      where: { driverId, status: In([...LIVE_BOOKING_STATUSES]) },
    });
  }
}
