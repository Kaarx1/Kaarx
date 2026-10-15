import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { DriverSession } from '../entities';

@Injectable()
export class DriverSessionRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo(manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).getRepository(DriverSession);
  }
}
