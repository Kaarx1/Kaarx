import { ROLES, type Role } from '@kaarx/shared';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'refresh_tokens' })
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ROLES, enumName: 'party_type' })
  subjectType: Role;

  @Column({ type: 'uuid' })
  subjectId: string;

  @Column({ type: 'text' })
  tokenHash: string;

  @Column({ type: 'uuid', nullable: true })
  deviceId: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
