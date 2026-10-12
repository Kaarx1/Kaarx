import { OFFER_RESPONSES, type OfferResponse } from '@kaarx/shared';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'booking_offers' })
export class BookingOffer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  bookingId: string;

  @Column({ type: 'uuid' })
  driverId: string;

  @Column({ type: 'integer' })
  round: number;

  @Column({ type: 'integer', nullable: true })
  distanceToPickupM: number | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  offeredAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @Column({ type: 'enum', enum: OFFER_RESPONSES, enumName: 'offer_response', default: 'pending' })
  response: OfferResponse;

  @Column({ type: 'text', nullable: true })
  declineReason: string | null;
}
