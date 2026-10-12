import { LANGUAGES, type Language } from '@kaarx/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ACCOUNT_STATUSES, type AccountStatus } from './columns';

@Entity({ name: 'customers' })
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  phone: string;

  @Column({ type: 'text', nullable: true })
  fullName: string | null;

  @Column({ type: 'text', nullable: true })
  email: string | null;

  @Column({ type: 'enum', enum: LANGUAGES, enumName: 'language_code', default: 'en' })
  preferredLanguage: Language;

  @Column({ type: 'timestamptz', nullable: true })
  ageConfirmedAt: Date | null;

  @Column({ type: 'enum', enum: ACCOUNT_STATUSES, enumName: 'account_status', default: 'active' })
  status: AccountStatus;

  @Column({ type: 'text', nullable: true })
  blockedReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
