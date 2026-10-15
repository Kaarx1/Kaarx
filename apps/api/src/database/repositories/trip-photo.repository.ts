import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TripPhoto } from '../entities';

@Injectable()
export class TripPhotoRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo(manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).getRepository(TripPhoto);
  }
}
