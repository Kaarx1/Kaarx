import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { numericArrayTransformer, numericTransformer } from './columns';

@Entity({ name: 'dispatch_settings' })
export class DispatchSettings {
  @PrimaryColumn({ type: 'uuid' })
  cityId: string;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 1,
    default: 3,
    transformer: numericTransformer,
  })
  initialRadiusKm: number;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 1,
    array: true,
    default: () => "'{3,5,8}'",
    transformer: numericArrayTransformer,
  })
  radiusStepsKm: number[];

  @Column({ type: 'integer', default: 15 })
  offerTimeoutSec: number;

  @Column({ type: 'integer', default: 3 })
  maxRounds: number;

  @Column({ type: 'integer', default: 5 })
  maxSimultaneousOffers: number;

  @Column({ type: 'integer', default: 60 })
  scheduledAssignBeforeMin: number;

  @Column({ type: 'integer', array: true, default: () => "'{60,15}'" })
  reminderMinutes: number[];

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
