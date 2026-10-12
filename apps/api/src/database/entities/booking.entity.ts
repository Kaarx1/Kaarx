import {
  BOOKING_STATUSES,
  CANCELLED_BY,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  type BookingStatus,
  type CancelledBy,
  type FareBreakdown,
  type PaymentMethod,
  type PaymentStatus,
  type VehicleSnapshot,
} from '@kaarx/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BOOKING_TYPES, type BookingType, type GeoPoint } from './columns';

@Entity({ name: 'bookings' })
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Filled by the DB default ('KX-' || booking_code_seq); reload after insert.
  @Column({ type: 'text', insert: false, update: false })
  code: string;

  @Column({ type: 'uuid' })
  customerId: string;

  @Column({ type: 'uuid' })
  vehicleId: string;

  @Column({ type: 'jsonb' })
  vehicleSnapshot: VehicleSnapshot;

  @Column({ type: 'uuid' })
  cityId: string;

  @Column({ type: 'uuid', nullable: true })
  zoneId: string | null;

  @Column({ type: 'enum', enum: BOOKING_TYPES, enumName: 'booking_type', default: 'instant' })
  type: BookingType;

  @Column({
    type: 'enum',
    enum: BOOKING_STATUSES,
    enumName: 'booking_status',
    default: 'searching',
  })
  status: BookingStatus;

  @Column({ type: 'text' })
  pickupAddress: string;

  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
  pickupLocation: GeoPoint;

  @Column({ type: 'text', nullable: true })
  pickupInstructions: string | null;

  @Column({ type: 'text' })
  dropoffAddress: string;

  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
  dropoffLocation: GeoPoint;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid' })
  pricingRuleId: string;

  @Column({ type: 'integer', nullable: true })
  estimatedDistanceM: number | null;

  @Column({ type: 'integer', nullable: true })
  estimatedDurationS: number | null;

  @Column({ type: 'integer' })
  estimatedFarePaise: number;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  estimatedBreakdown: FareBreakdown;

  @Column({ type: 'uuid', nullable: true })
  driverId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  assignedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  arrivedAt: Date | null;

  @Column({ type: 'char', length: 4 })
  otpCode: string;

  @Column({ type: 'timestamptz', nullable: true })
  otpVerifiedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ type: 'integer', nullable: true })
  actualDistanceM: number | null;

  @Column({ type: 'integer', nullable: true })
  actualDurationS: number | null;

  @Column({ type: 'integer', default: 0 })
  waitingS: number;

  @Column({ type: 'integer', nullable: true })
  finalFarePaise: number | null;

  @Column({ type: 'jsonb', nullable: true })
  finalBreakdown: FareBreakdown | null;

  @Column({ type: 'integer', nullable: true })
  platformFeePaise: number | null;

  @Column({ type: 'integer', nullable: true })
  driverEarningPaise: number | null;

  @Column({ type: 'enum', enum: PAYMENT_METHODS, enumName: 'payment_method_type', default: 'cash' })
  paymentMethod: PaymentMethod;

  @Column({
    type: 'enum',
    enum: PAYMENT_STATUSES,
    enumName: 'payment_status_type',
    default: 'unpaid',
  })
  paymentStatus: PaymentStatus;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'enum', enum: CANCELLED_BY, enumName: 'cancelled_by_type', nullable: true })
  cancelledBy: CancelledBy | null;

  @Column({ type: 'text', nullable: true })
  cancelReason: string | null;

  @Column({ type: 'integer', default: 0 })
  cancellationFeePaise: number;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'integer', default: 0 })
  dispatchRound: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
