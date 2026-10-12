import type { CustomerProfile, VehicleSnapshot } from '@kaarx/shared';
import type { Customer, EmergencyContact, Vehicle } from '../../database/entities';

export interface VehicleView extends VehicleSnapshot {
  id: string;
  insurerName: string | null;
  isDefault: boolean;
  createdAt: Date;
}

export interface EmergencyContactView {
  id: string;
  name: string;
  phone: string;
  relation: string | null;
}

export function toCustomerProfile(customer: Customer): CustomerProfile {
  return {
    id: customer.id,
    phone: customer.phone,
    fullName: customer.fullName,
    email: customer.email,
    preferredLanguage: customer.preferredLanguage,
    profileComplete: customer.fullName !== null && customer.ageConfirmedAt !== null,
  };
}

export function toVehicleSnapshot(vehicle: Vehicle): VehicleSnapshot {
  return {
    registrationNumber: vehicle.registrationNumber,
    brand: vehicle.brand,
    model: vehicle.model,
    colour: vehicle.colour,
    bodyType: vehicle.bodyType,
    fuel: vehicle.fuel,
    transmission: vehicle.transmission,
    insuranceStatus: vehicle.insuranceStatus,
    insuranceValidTill: vehicle.insuranceValidTill,
    notes: vehicle.notes,
  };
}

export function toVehicleView(vehicle: Vehicle): VehicleView {
  return {
    id: vehicle.id,
    ...toVehicleSnapshot(vehicle),
    insurerName: vehicle.insurerName,
    isDefault: vehicle.isDefault,
    createdAt: vehicle.createdAt,
  };
}

export function toEmergencyContactView(contact: EmergencyContact): EmergencyContactView {
  return { id: contact.id, name: contact.name, phone: contact.phone, relation: contact.relation };
}
