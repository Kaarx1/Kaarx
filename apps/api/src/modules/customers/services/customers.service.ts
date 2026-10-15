import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type {
  CustomerProfile,
  EmergencyContactsInput,
  UpdateProfileInput,
  VehicleInput,
} from '@kaarx/shared';
import { isUniqueViolation } from '../../../common/db-errors';
import type { Customer, Vehicle } from '../../../database/entities';
import {
  CustomerRepository,
  EmergencyContactRepository,
  VehicleRepository,
} from '../../../database/repositories';
import { ACCOUNT_BLOCKED } from '../../auth/services/auth.service';
import {
  toCustomerProfile,
  toEmergencyContactView,
  toVehicleView,
  type EmergencyContactView,
  type VehicleView,
} from '../customer.views';

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

@Injectable()
export class CustomersService {
  constructor(
    private readonly customerRepo: CustomerRepository,
    private readonly vehicleRepo: VehicleRepository,
    private readonly contactRepo: EmergencyContactRepository,
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
    return toCustomerProfile(await this.customerRepo.save(customer));
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
    const vehicles = await this.vehicleRepo.findActiveByCustomer(customerId);
    return vehicles.map(toVehicleView);
  }

  async addVehicle(customerId: string, input: VehicleInput): Promise<VehicleView> {
    const vehicleId = await this.withDuplicateGuard(() =>
      this.dataSource.transaction(async (m) => {
        await this.lockCustomer(m, customerId);
        const existing = await this.vehicleRepo.findByRegistration(
          customerId,
          input.registrationNumber,
          m,
        );
        if (existing?.isActive) throw new ConflictException(DUPLICATE_VEHICLE);
        const hasDefault = await this.vehicleRepo.hasDefault(customerId, m);
        const fields = { ...vehicleFields(input), isActive: true, isDefault: !hasDefault };
        if (existing) {
          await this.vehicleRepo.update(existing.id, fields, m);
          return existing.id;
        }
        const id = randomUUID();
        await this.vehicleRepo.insert({ id, customerId, ...fields }, m);
        return id;
      }),
    );
    return toVehicleView(await this.vehicleRepo.findByIdOrFail(vehicleId));
  }

  async replaceVehicle(
    customerId: string,
    vehicleId: string,
    input: VehicleInput,
  ): Promise<VehicleView> {
    await this.getOwnedVehicle(customerId, vehicleId);
    await this.withDuplicateGuard(() => this.vehicleRepo.update(vehicleId, vehicleFields(input)));
    return toVehicleView(await this.vehicleRepo.findByIdOrFail(vehicleId));
  }

  async removeVehicle(customerId: string, vehicleId: string): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      await this.lockCustomer(m, customerId);
      const vehicle = await this.getOwnedVehicle(customerId, vehicleId, m);
      await this.vehicleRepo.update(vehicle.id, { isActive: false, isDefault: false }, m);
      if (!vehicle.isDefault) return;
      const next = await this.vehicleRepo.findLatestActive(customerId, m);
      if (next) await this.vehicleRepo.update(next.id, { isDefault: true }, m);
    });
  }

  async setDefaultVehicle(customerId: string, vehicleId: string): Promise<VehicleView> {
    await this.dataSource.transaction(async (m) => {
      await this.lockCustomer(m, customerId);
      const vehicle = await this.getOwnedVehicle(customerId, vehicleId, m);
      await this.vehicleRepo.clearDefault(customerId, m);
      await this.vehicleRepo.update(vehicle.id, { isDefault: true }, m);
    });
    return toVehicleView(await this.vehicleRepo.findByIdOrFail(vehicleId));
  }

  getVehicleForBooking(customerId: string, vehicleId: string): Promise<Vehicle> {
    return this.getOwnedVehicle(customerId, vehicleId);
  }

  async getEmergencyContacts(customerId: string): Promise<{ contacts: EmergencyContactView[] }> {
    const contacts = await this.contactRepo.findByCustomer(customerId);
    return { contacts: contacts.map(toEmergencyContactView) };
  }

  async replaceEmergencyContacts(
    customerId: string,
    input: EmergencyContactsInput,
  ): Promise<{ contacts: EmergencyContactView[] }> {
    await this.dataSource.transaction(async (m) => {
      await this.lockCustomer(m, customerId);
      await this.contactRepo.deleteByCustomer(customerId, m);
      if (input.contacts.length === 0) return;
      await this.contactRepo.insertMany(
        input.contacts.map((c) => ({
          customerId,
          name: c.name,
          phone: c.phone,
          relation: c.relation ?? null,
        })),
        m,
      );
    });
    return this.getEmergencyContacts(customerId);
  }

  private async getCustomer(customerId: string): Promise<Customer> {
    const customer = await this.customerRepo.findById(customerId);
    if (!customer) throw new NotFoundException(CUSTOMER_NOT_FOUND);
    return customer;
  }

  private async getOwnedVehicle(
    customerId: string,
    vehicleId: string,
    manager?: EntityManager,
  ): Promise<Vehicle> {
    const vehicle = await this.vehicleRepo.findOwned(customerId, vehicleId, manager);
    if (!vehicle) throw new NotFoundException(VEHICLE_NOT_FOUND);
    return vehicle;
  }

  private async lockCustomer(m: EntityManager, customerId: string): Promise<void> {
    const customer = await this.customerRepo.lockById(customerId, m);
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
