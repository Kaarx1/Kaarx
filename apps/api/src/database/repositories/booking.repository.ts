import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Booking } from '../entities';

@Injectable()
export class BookingRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo(manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).getRepository(Booking);
  }
}
