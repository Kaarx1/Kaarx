import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { EmergencyContact } from '../entities';

@Injectable()
export class EmergencyContactRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo(manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).getRepository(EmergencyContact);
  }

  findByCustomer(customerId: string, manager?: EntityManager): Promise<EmergencyContact[]> {
    return this.repo(manager).find({ where: { customerId }, order: { createdAt: 'ASC' } });
  }

  async deleteByCustomer(customerId: string, manager?: EntityManager): Promise<void> {
    await this.repo(manager).delete({ customerId });
  }

  async insertMany(rows: Partial<EmergencyContact>[], manager?: EntityManager): Promise<void> {
    await this.repo(manager).insert(rows);
  }
}
