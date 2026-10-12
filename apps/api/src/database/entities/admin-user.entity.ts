import { ADMIN_ROLES, type AdminRole } from '@kaarx/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ACCOUNT_STATUSES, type AccountStatus } from './columns';

@Entity({ name: 'admin_users' })
export class AdminUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'text' })
  passwordHash: string;

  @Column({ type: 'text' })
  fullName: string;

  @Column({ type: 'text', nullable: true })
  phone: string | null;

  @Column({ type: 'enum', enum: ADMIN_ROLES, enumName: 'admin_role', default: 'read_only' })
  role: AdminRole;

  @Column({ type: 'enum', enum: ACCOUNT_STATUSES, enumName: 'account_status', default: 'active' })
  status: AccountStatus;

  @Column({ type: 'text', nullable: true })
  totpSecret: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
