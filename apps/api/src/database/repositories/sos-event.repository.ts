import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SosEvent } from '../entities';

@Injectable()
export class SosEventRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo(manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).getRepository(SosEvent);
  }
}
