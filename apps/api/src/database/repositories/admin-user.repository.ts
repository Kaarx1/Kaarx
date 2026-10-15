import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AdminUser } from '../entities';

@Injectable()
export class AdminUserRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo(manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).getRepository(AdminUser);
  }
}
