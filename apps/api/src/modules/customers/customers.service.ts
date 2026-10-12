import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type {
  CustomerProfile,
  EmergencyContactsInput,
  UpdateProfileInput,
  VehicleInput,
} from '@kaarx/shared';
import { isUniqueViolation } from '../../common/db-errors';
import { Customer, EmergencyContact, Vehicle } from '../../database/entities';
import { ACCOUNT_BLOCKED } from '../auth/auth.service';
import {
  toCustomerProfile,
  toEmergencyContactView,
  toVehicleView,
  type EmergencyContactView,
  type VehicleView,
} from './customer.views';

const CUSTOMER_NOT_FOUND = 'Customer not found';
const VEHICLE_NOT_FOUND = 'Vehicle not found';
const DUPLICATE_VEHICLE = 'This vehicle is already in your list';
const VEHICLE_REGISTRATION_UNIQUE = 'vehicles_customer_id_registration_number_key';

function vehicleFields(input: VehicleInput) {
  return {
    registrationNumber: input.registrationNumber,
    brand: input.brand,
    model: input.model,
    colour: input.colour,
    bodyType: input.bodyType,
    fuel: input.fuel,
    transmission: input.transmission,
    insuranceStatus: input.insuranceStatus,
    insuranceValidTill: input.insuranceValidTill ?? null,
    insurerName: input.insurerName ?? null,
    notes: input.notes ?? null,
    ownershipDeclaredAt: new Date(),
  };
}

async function findOwnedVehicle(
  repo: Repository<Vehicle>,
  customerId: string,
  vehicleId: string,
): Promise<Vehicle> {
  const vehicle = await repo.findOneBy({ id: vehicleId, customerId, isActive: true });
  if (!vehicle) throw new NotFoundException(VEHICLE_NOT_FOUND);
  return vehicle;
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(EmergencyContact) private readonly contacts: Repository<EmergencyContact>,
    private readonly dataSource: DataSource,
  ) {}

  async getProfile(customerId: string): Promise<CustomerProfile> {
    return toCustomerProfile(await this.getCustomer(customerId));
  }

  async updateProfile(customerId: string, input: UpdateProfileInput): Promise<CustomerProfile> {
    const customer = await this.getCustomer(customerId);
    customer.fullName = input.fullName;
    if (input.email !== undefined) customer.email = input.email;
    if (input.preferredLanguage !== undefined) customer.preferredLanguage = input.preferredLanguage;
    if (input.ageConfirmed) customer.ageConfirmedAt ??= new Date();
    return toCustomerProfile(await this.customers.save(customer));
  }

  async assertCanBook(customerId: string): Promise<Customer> {
    const customer = await this.getCustomer(customerId);
    if (customer.status === 'blocked') throw new ForbiddenException(ACCOUNT_BLOCKED);
    if (customer.fullName === null || customer.ageConfirmedAt === null) {
      throw new ConflictException('Add your name and confirm you are 18 or older before booking');
    }
    return customer;
  }

  async getContactCard(customerId: string): Promise<{ firstName: string; phone: string }> {
    const customer = await this.getCustomer(customerId);
    const firstName = customer.fullName?.trim().split(/\s+/)[0] || 'Customer';
    return { firstName, phone: customer.phone };
  }

  async listVehicles(customerId: string): Promise<VehicleView[]> {
    const vehicles = await this.vehicles.find({
      where: { customerId, isActive: true },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
    return vehicles.map(toVehicleView);
  }

  async addVehicle(customerId: string, input: VehicleInput): Promise<VehicleView> {
    const vehicleId = await this.withDuplicateGuard(() =>
      this.dataSource.transaction(async (m) => {
        await this.lockCustomer(m, customerId);
        const repo = m.getRepository(Vehicle);
        const existing = await repo.findOneBy({
          customerId,
          registrationNumber: input.registrationNumber,
        });
        if (existing?.isActive) throw new ConflictException(DUPLICATE_VEHICLE);
        const hasDefault = await repo.existsBy({ customerId, isActive: true, isDefault: true });
        const fields = { ...vehicleFields(input), isActive: true, isDefault: !hasDefault };
        if (existing) {
          await repo.update(existing.id, fields);
          return existing.id;
        }
        const id = randomUUID();
        await repo.insert({ id, customerId, ...fields });
        return id;
      }),
    );
    return toVehicleView(await this.vehicles.findOneByOrFail({ id: vehicleId }));
  }

  async replaceVehicle(
    customerId: string,
    vehicleId: string,
    input: VehicleInput,
  ): Promise<VehicleView> {
    await findOwnedVehicle(this.vehicles, customerId, vehicleId);
    await this.withDuplicateGuard(() => this.vehicles.update(vehicleId, vehicleFields(input)));
    return toVehicleView(await this.vehicles.findOneByOrFail({ id: vehicleId }));
  }

  async removeVehicle(customerId: string, vehicleId: string): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      await this.lockCustomer(m, customerId);
      const repo = m.getRepository(Vehicle);
      const vehicle = await findOwnedVehicle(repo, customerId, vehicleId);
      await repo.update(vehicle.id, { isActive: false, isDefault: false });
      if (!vehicle.isDefault) return;
      const next = await repo.findOne({
        where: { customerId, isActive: true },
        order: { createdAt: 'DESC' },
      });
      if (next) await repo.update(next.id, { isDefault: true });
    });
  }

  async setDefaultVehicle(customerId: string, vehicleId: string): Promise<VehicleView> {
    await this.dataSource.transaction(async (m) => {
      await this.lockCustomer(m, customerId);
      const repo = m.getRepository(Vehicle);
      const vehicle = await findOwnedVehicle(repo, customerId, vehicleId);
      await repo.update({ customerId, isDefault: true }, { isDefault: false });
      await repo.update(vehicle.id, { isDefault: true });
    });
    return toVehicleView(await this.vehicles.findOneByOrFail({ id: vehicleId }));
  }

  getVehicleForBooking(customerId: string, vehicleId: string): Promise<Vehicle> {
    return findOwnedVehicle(this.vehicles, customerId, vehicleId);
  }

  async getEmergencyContacts(customerId: string): Promise<{ contacts: EmergencyContactView[] }> {
    const contacts = await this.contacts.find({
      where: { customerId },
      order: { createdAt: 'ASC' },
    });
    return { contacts: contacts.map(toEmergencyContactView) };
  }

  async replaceEmergencyContacts(
    customerId: string,
    input: EmergencyContactsInput,
  ): Promise<{ contacts: EmergencyContactView[] }> {
    await this.dataSource.transaction(async (m) => {
      await this.lockCustomer(m, customerId);
      const repo = m.getRepository(EmergencyContact);
      await repo.delete({ customerId });
      if (input.contacts.length === 0) return;
      await repo.insert(
        input.contacts.map((c) => ({
          customerId,
          name: c.name,
          phone: c.phone,
          relation: c.relation ?? null,
        })),
      );
    });
    return this.getEmergencyContacts(customerId);
  }

  private async getCustomer(customerId: string): Promise<Customer> {
    const customer = await this.customers.findOneBy({ id: customerId });
    if (!customer) throw new NotFoundException(CUSTOMER_NOT_FOUND);
    return customer;
  }

  private async lockCustomer(m: EntityManager, customerId: string): Promise<void> {
    const customer = await m
      .getRepository(Customer)
      .findOne({ where: { id: customerId }, lock: { mode: 'pessimistic_write' } });
    if (!customer) throw new NotFoundException(CUSTOMER_NOT_FOUND);
  }

  private async withDuplicateGuard<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error, VEHICLE_REGISTRATION_UNIQUE))
        throw new ConflictException(DUPLICATE_VEHICLE);
      throw error;
    }
  }
}
