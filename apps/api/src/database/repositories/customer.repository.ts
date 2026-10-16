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

  findByPhone(phone: string, manager?: EntityManager): Promise<Customer | null> {
    return this.repo(manager).findOneBy({ phone });
  }

  findByPhoneOrFail(phone: string, manager?: EntityManager): Promise<Customer> {
    return this.repo(manager).findOneByOrFail({ phone });
  }

  async insertIfMissing(phone: string, manager?: EntityManager): Promise<void> {
    await this.repo(manager).createQueryBuilder().insert().values({ phone }).orIgnore().execute();
  }

  lockById(id: string, manager: EntityManager): Promise<Customer | null> {
    return this.repo(manager).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
  }

  save(customer: Customer, manager?: EntityManager): Promise<Customer> {
    return this.repo(manager).save(customer);
  }
}
