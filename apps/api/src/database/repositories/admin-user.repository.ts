import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AdminUser } from '../entities';

@Injectable()
export class AdminUserRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo(manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).getRepository(AdminUser);
  }

  findById(id: string, manager?: EntityManager): Promise<AdminUser | null> {
    return this.repo(manager).findOneBy({ id });
  }

  findByEmail(email: string, manager?: EntityManager): Promise<AdminUser | null> {
    return this.repo(manager)
      .createQueryBuilder('admin')
      .where('lower(admin.email) = lower(:email)', { email })
      .getOne();
  }

  async update(id: string, fields: Partial<AdminUser>, manager?: EntityManager): Promise<void> {
    await this.repo(manager).update(id, fields);
  }
}
