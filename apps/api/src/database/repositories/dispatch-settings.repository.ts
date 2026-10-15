import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { DispatchSettings } from '../entities';

@Injectable()
export class DispatchSettingsRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo(manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).getRepository(DispatchSettings);
  }
}
