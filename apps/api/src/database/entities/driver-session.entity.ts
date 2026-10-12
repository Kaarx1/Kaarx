import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'driver_sessions' })
export class DriverSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  driverId: string;

  @Column({ type: 'uuid', nullable: true })
  zoneId: string | null;

  @Column({ type: 'uuid', nullable: true })
  deviceId: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  wentOnlineAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  wentOfflineAt: Date | null;
}
