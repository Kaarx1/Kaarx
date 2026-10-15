import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BookingOffer } from '../entities';

@Injectable()
export class BookingOfferRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo(manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).getRepository(BookingOffer);
  }
}
