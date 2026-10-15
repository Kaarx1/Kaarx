import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Customer } from '../entities';

@Injectable()
export class CustomerRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo(manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).getRepository(Customer);
  }

  findById(id: string, manager?: EntityManager): Promise<Customer | null> {
    return this.repo(manager).findOneBy({ id });
  }

  lockById(id: string, manager: EntityManager): Promise<Customer | null> {
    return this.repo(manager).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
  }

  save(customer: Customer, manager?: EntityManager): Promise<Customer> {
    return this.repo(manager).save(customer);
  }
}
