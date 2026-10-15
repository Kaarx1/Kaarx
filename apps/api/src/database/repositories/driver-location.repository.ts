import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

@Injectable()
export class DriverLocationRepository {
  constructor(private readonly dataSource: DataSource) {}

  private manager(manager?: EntityManager) {
    return manager ?? this.dataSource.manager;
  }
}
