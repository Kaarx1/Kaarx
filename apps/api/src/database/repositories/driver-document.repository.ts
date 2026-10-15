import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, type QueryDeepPartialEntity } from 'typeorm';
import { DriverDocument } from '../entities';

@Injectable()
export class DriverDocumentRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo(manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).getRepository(DriverDocument);
  }

  findByIdOrFail(id: string, manager?: EntityManager): Promise<DriverDocument> {
    return this.repo(manager).findOneByOrFail({ id });
  }

  findByDriver(driverId: string, manager?: EntityManager): Promise<DriverDocument[]> {
    return this.repo(manager).find({ where: { driverId }, order: { createdAt: 'ASC' } });
  }

  async insert(
    values: QueryDeepPartialEntity<DriverDocument>,
    manager?: EntityManager,
  ): Promise<void> {
    await this.repo(manager).insert(values);
  }
}
