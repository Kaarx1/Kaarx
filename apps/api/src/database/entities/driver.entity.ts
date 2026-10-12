import {
  BODY_TYPES,
  DRIVER_TRANSMISSIONS,
  GENDERS,
  LANGUAGES,
  VERIFICATION_STATUSES,
  type BodyType,
  type DriverTransmission,
  type Gender,
  type Language,
  type VerificationStatus,
} from '@kaarx/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ACCOUNT_STATUSES, numericTransformer, type AccountStatus } from './columns';

@Entity({ name: 'drivers' })
export class Driver {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Filled by the DB default ('KD-' || driver_code_seq); reload after insert.
  @Column({ type: 'text', insert: false, update: false })
  code: string;

  @Column({ type: 'text' })
  phone: string;

  @Column({ type: 'text' })
  fullName: string;

  @Column({ type: 'date' })
  dob: string;

  @Column({ type: 'enum', enum: GENDERS, enumName: 'gender_type' })
  gender: Gender;

  @Column({ type: 'text', nullable: true })
  email: string | null;

  @Column({ type: 'text', nullable: true })
  photoUrl: string | null;

  @Column({ type: 'enum', enum: LANGUAGES, enumName: 'language_code', default: 'en' })
  preferredLanguage: Language;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  languages: string[];

  @Column({ type: 'text' })
  currentAddress: string;

  @Column({ type: 'text', nullable: true })
  permanentAddress: string | null;

  @Column({ type: 'text' })
  emergencyContactName: string;

  @Column({ type: 'text', nullable: true })
  emergencyContactRelation: string | null;

  @Column({ type: 'text' })
  emergencyContactPhone: string;

  @Column({ type: 'numeric', precision: 4, scale: 1, transformer: numericTransformer })
  experienceYears: number;

  @Column({ type: 'enum', enum: DRIVER_TRANSMISSIONS, enumName: 'driver_transmission' })
  transmission: DriverTransmission;

  @Column({
    type: 'enum',
    enum: BODY_TYPES,
    enumName: 'vehicle_body_type',
    array: true,
    default: () => "'{}'",
  })
  bodyTypes: BodyType[];

  @Column({ type: 'boolean', default: false })
  evExperience: boolean;

  @Column({ type: 'boolean', nullable: true })
  nightDriving: boolean | null;

  @Column({ type: 'text', nullable: true })
  previousPlatform: string | null;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 1,
    default: 5,
    transformer: numericTransformer,
  })
  maxPickupDistanceKm: number;

  @Column({
    type: 'enum',
    enum: VERIFICATION_STATUSES,
    enumName: 'verification_status_type',
    default: 'pending',
  })
  verificationStatus: VerificationStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  activatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  suspendedUntil: Date | null;

  @Column({ type: 'text', nullable: true })
  suspensionReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  trainingCompletedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  agreementVersion: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  agreementSignedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  codeOfConductSignedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  idCardNumber: string | null;

  @Column({
    type: 'numeric',
    precision: 3,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  ratingAvg: number;

  @Column({ type: 'integer', default: 0 })
  ratingCount: number;

  @Column({ type: 'integer', default: 0 })
  totalTrips: number;

  @Column({ type: 'enum', enum: ACCOUNT_STATUSES, enumName: 'account_status', default: 'active' })
  status: AccountStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
