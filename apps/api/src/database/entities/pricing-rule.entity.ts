import { BODY_TYPES, type BodyType } from '@kaarx/shared';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from './columns';

@Entity({ name: 'pricing_rules' })
export class PricingRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  cityId: string;

  @Column({ type: 'enum', enum: BODY_TYPES, enumName: 'vehicle_body_type', nullable: true })
  bodyType: BodyType | null;

  @Column({ type: 'integer' })
  baseFarePaise: number;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 1,
    default: 0,
    transformer: numericTransformer,
  })
  includedKm: number;

  @Column({ type: 'integer' })
  perKmPaise: number;

  @Column({ type: 'integer', default: 0 })
  serviceFeePaise: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, transformer: numericTransformer })
  platformCommissionPct: number;

  @Column({ type: 'integer', default: 5 })
  freeWaitingMin: number;

  @Column({ type: 'integer', default: 0 })
  waitingPerMinPaise: number;

  @Column({ type: 'integer', default: 0 })
  minFarePaise: number;

  @Column({ type: 'integer', default: 0 })
  cancellationFeePaise: number;

  @Column({ type: 'integer', default: 120 })
  cancellationGraceSec: number;

  @Column({ type: 'time', nullable: true })
  nightStart: string | null;

  @Column({ type: 'time', nullable: true })
  nightEnd: string | null;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  nightPct: number;

  @Column({ type: 'integer', default: 0 })
  scheduledPremiumPaise: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  effectiveFrom: Date;

  @Column({ type: 'timestamptz', nullable: true })
  effectiveTo: Date | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
