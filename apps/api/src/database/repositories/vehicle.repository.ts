import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Vehicle } from '../entities';

@Injectable()
export class VehicleRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo(manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).getRepository(Vehicle);
  }

  findByIdOrFail(id: string, manager?: EntityManager): Promise<Vehicle> {
    return this.repo(manager).findOneByOrFail({ id });
  }

  findOwned(
    customerId: string,
    vehicleId: string,
    manager?: EntityManager,
  ): Promise<Vehicle | null> {
    return this.repo(manager).findOneBy({ id: vehicleId, customerId, isActive: true });
  }

  findActiveByCustomer(customerId: string, manager?: EntityManager): Promise<Vehicle[]> {
    return this.repo(manager).find({
      where: { customerId, isActive: true },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  findLatestActive(customerId: string, manager?: EntityManager): Promise<Vehicle | null> {
    return this.repo(manager).findOne({
      where: { customerId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  findByRegistration(
    customerId: string,
    registrationNumber: string,
    manager?: EntityManager,
  ): Promise<Vehicle | null> {
    return this.repo(manager).findOneBy({ customerId, registrationNumber });
  }

  hasDefault(customerId: string, manager?: EntityManager): Promise<boolean> {
    return this.repo(manager).existsBy({ customerId, isActive: true, isDefault: true });
  }

  async insert(values: Partial<Vehicle>, manager?: EntityManager): Promise<void> {
    await this.repo(manager).insert(values);
  }

  async update(id: string, fields: Partial<Vehicle>, manager?: EntityManager): Promise<void> {
    await this.repo(manager).update(id, fields);
  }

  async clearDefault(customerId: string, manager?: EntityManager): Promise<void> {
    await this.repo(manager).update({ customerId, isDefault: true }, { isDefault: false });
  }
}
