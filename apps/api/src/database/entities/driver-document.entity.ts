import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  type DocumentStatus,
  type DocumentType,
} from '@kaarx/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'driver_documents' })
export class DriverDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  driverId: string;

  @Column({ type: 'enum', enum: DOCUMENT_TYPES, enumName: 'document_type' })
  type: DocumentType;

  @Column({ type: 'text', nullable: true })
  numberMasked: string | null;

  @Column({ type: 'date', nullable: true })
  issueDate: string | null;

  @Column({ type: 'date', nullable: true })
  expiryDate: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  fileUrls: string[];

  @Column({ type: 'jsonb', default: () => "'{}'" })
  details: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: DOCUMENT_STATUSES,
    enumName: 'document_status',
    default: 'pending',
  })
  status: DocumentStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
