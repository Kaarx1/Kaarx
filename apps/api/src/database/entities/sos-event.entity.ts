import { ROLES, type Role } from '@kaarx/shared';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { SOS_STATUSES, type GeoPoint, type SosStatus } from './columns';

@Entity({ name: 'sos_events' })
export class SosEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  bookingId: string | null;

  @Column({ type: 'enum', enum: ROLES, enumName: 'party_type' })
  raisedByType: Role;

  @Column({ type: 'uuid' })
  raisedById: string;

  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  location: GeoPoint | null;

  @Column({ type: 'enum', enum: SOS_STATUSES, enumName: 'sos_status', default: 'open' })
  status: SosStatus;

  @Column({ type: 'uuid', nullable: true })
  handledBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  handledAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
