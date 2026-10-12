import {
  BODY_TYPES,
  FUEL_TYPES,
  INSURANCE_STATUSES,
  TRANSMISSIONS,
  type BodyType,
  type FuelType,
  type InsuranceStatus,
  type Transmission,
} from '@kaarx/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'vehicles' })
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  customerId: string;

  @Column({ type: 'text' })
  registrationNumber: string;

  @Column({ type: 'text' })
  brand: string;

  @Column({ type: 'text' })
  model: string;

  @Column({ type: 'text' })
  colour: string;

  @Column({ type: 'enum', enum: BODY_TYPES, enumName: 'vehicle_body_type' })
  bodyType: BodyType;

  @Column({ type: 'enum', enum: FUEL_TYPES, enumName: 'fuel_type' })
  fuel: FuelType;

  @Column({ type: 'enum', enum: TRANSMISSIONS, enumName: 'transmission_type' })
  transmission: Transmission;

  @Column({ type: 'enum', enum: INSURANCE_STATUSES, enumName: 'insurance_status_type' })
  insuranceStatus: InsuranceStatus;

  @Column({ type: 'date', nullable: true })
  insuranceValidTill: string | null;

  @Column({ type: 'text', nullable: true })
  insurerName: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  ownershipDeclaredAt: Date;

  @Column({ type: 'text', nullable: true })
  rcPhotoUrl: string | null;

  @Column({ type: 'date', nullable: true })
  pucValidTill: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
