import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

@Injectable()
export class DriverSessionRepository {
  constructor(private readonly dataSource: DataSource) {}

  private manager(manager?: EntityManager) {
    return manager ?? this.dataSource.manager;
  }

  async openSession(driverId: string, zoneId: string, manager?: EntityManager): Promise<void> {
    await this.manager(manager).query(
      `insert into driver_sessions (driver_id, zone_id) values ($1, $2)
       on conflict (driver_id) where went_offline_at is null do nothing`,
      [driverId, zoneId],
    );
  }

  async closeOpenSession(driverId: string, manager?: EntityManager): Promise<void> {
    await this.manager(manager).query(
      'update driver_sessions set went_offline_at = now() where driver_id = $1 and went_offline_at is null',
      [driverId],
    );
  }
}
