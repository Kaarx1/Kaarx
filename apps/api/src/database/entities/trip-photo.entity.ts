import { PHOTO_PHASES, PHOTO_SIDES, type PhotoPhase, type PhotoSide } from '@kaarx/shared';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { GeoPoint } from './columns';

@Entity({ name: 'trip_photos' })
export class TripPhoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  bookingId: string;

  @Column({ type: 'uuid' })
  driverId: string;

  @Column({ type: 'enum', enum: PHOTO_PHASES, enumName: 'photo_phase' })
  phase: PhotoPhase;

  @Column({ type: 'enum', enum: PHOTO_SIDES, enumName: 'photo_side' })
  side: PhotoSide;

  // Storage object key (trips/<bookingId>/<phase>/<side>-<uuid>.jpg), not a public URL.
  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  takenAt: Date;

  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  location: GeoPoint | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
