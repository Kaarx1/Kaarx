import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type {
  AdminBookingDetail,
  AdminBookingRow,
  AdminBookingsQuery,
  BookingStatus,
  OfferResponse,
  PhotoPhase,
  PhotoSide,
  Role,
} from '@kaarx/shared';
import { Booking } from '../../database/entities';
import { BookingViewsService } from '../bookings/booking-views.service';
import { StorageService } from '../storage/storage.service';

const MAX_ROWS = 100;
const MIN_PHONE_DIGITS = 4;

interface BookingRowSql {
  id: string;
  code: string;
  status: BookingStatus;
  created_at: Date;
  pickup_address: string;
  dropoff_address: string;
  estimated_fare_paise: number;
  final_fare_paise: number | null;
  customer_name: string | null;
  customer_phone: string;
  driver_name: string | null;
  driver_phone: string | null;
  vehicle_number: string;
}

interface EventRowSql {
  event_type: string;
  actor_type: Role | null;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: Date;
}

interface OfferRowSql {
  driver_id: string;
  driver_name: string;
  round: number;
  response: OfferResponse;
  distance_to_pickup_m: number | null;
  offered_at: Date;
  responded_at: Date | null;
}

interface PhotoRowSql {
  phase: PhotoPhase;
  side: PhotoSide;
  url: string;
  taken_at: Date;
}

@Injectable()
export class AdminBookingsService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly views: BookingViewsService,
    private readonly storage: StorageService,
  ) {}

  async list(query: AdminBookingsQuery): Promise<AdminBookingRow[]> {
    const q = query.q ?? null;
    const phoneDigits = q ? q.replace(/\D/g, '') : '';
    const rows: BookingRowSql[] = await this.ds.query(
      `select b.id, b.code, b.status, b.created_at, b.pickup_address, b.dropoff_address,
              b.estimated_fare_paise, b.final_fare_paise,
              c.full_name as customer_name, c.phone as customer_phone,
              d.full_name as driver_name, d.phone as driver_phone,
              b.vehicle_snapshot->>'registrationNumber' as vehicle_number
         from bookings b
         join customers c on c.id = b.customer_id
         left join drivers d on d.id = b.driver_id
        where ($1::booking_status is null or b.status = $1::booking_status)
          and ($2::text is null
               or b.code ilike $2::text
               or b.vehicle_snapshot->>'registrationNumber' like $3::text
               or c.phone like $4::text)
        order by b.created_at desc
        limit ${MAX_ROWS}`,
      [
        query.status ?? null,
        q ? `%${q}%` : null,
        q ? `%${q.replace(/[\s-]/g, '').toUpperCase()}%` : null,
        phoneDigits.length >= MIN_PHONE_DIGITS ? `%${phoneDigits}%` : null,
      ],
    );
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      pickupAddress: row.pickup_address,
      dropoffAddress: row.dropoff_address,
      estimatedFarePaise: row.estimated_fare_paise,
      finalFarePaise: row.final_fare_paise,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      driverName: row.driver_name,
      driverPhone: row.driver_phone,
      vehicleNumber: row.vehicle_number,
    }));
  }

  async detail(id: string): Promise<AdminBookingDetail> {
    const booking = await this.bookings.findOneBy({ id });
    if (!booking) throw new NotFoundException('Booking not found');

    const [view, customers, drivers, events, offers, photos] = await Promise.all([
      this.views.customerView(booking),
      this.ds.query(`select id, full_name, phone from customers where id = $1`, [
        booking.customerId,
      ]) as Promise<{ id: string; full_name: string | null; phone: string }[]>,
      this.ds.query(`select phone from drivers where id = $1`, [booking.driverId]) as Promise<
        { phone: string }[]
      >,
      this.ds.query(
        `select event_type, actor_type, actor_id, payload, created_at
           from booking_events where booking_id = $1 order by created_at, id`,
        [id],
      ) as Promise<EventRowSql[]>,
      this.ds.query(
        `select o.driver_id, d.full_name as driver_name, o.round, o.response, o.distance_to_pickup_m,
                o.offered_at, o.responded_at
           from booking_offers o join drivers d on d.id = o.driver_id
          where o.booking_id = $1 order by o.round, o.offered_at`,
        [id],
      ) as Promise<OfferRowSql[]>,
      this.ds.query(
        `select phase, side, url, taken_at from trip_photos where booking_id = $1 order by phase, side, taken_at`,
        [id],
      ) as Promise<PhotoRowSql[]>,
    ]);

    const customer = customers[0];
    if (!customer) throw new NotFoundException('Booking not found');

    return {
      booking: view,
      customer: { id: customer.id, name: customer.full_name, phone: customer.phone },
      driverPhone: drivers[0]?.phone ?? null,
      events: events.map((event) => ({
        eventType: event.event_type,
        actorType: event.actor_type,
        actorId: event.actor_id,
        payload: event.payload,
        createdAt: event.created_at.toISOString(),
      })),
      offers: offers.map((offer) => ({
        driverId: offer.driver_id,
        driverName: offer.driver_name,
        round: offer.round,
        response: offer.response,
        distanceToPickupM: offer.distance_to_pickup_m,
        offeredAt: offer.offered_at.toISOString(),
        respondedAt: offer.responded_at ? offer.responded_at.toISOString() : null,
      })),
      photos: await Promise.all(
        photos.map(async (photo) => ({
          phase: photo.phase,
          side: photo.side,
          url: await this.storage.presignGet(photo.url),
          takenAt: photo.taken_at.toISOString(),
        })),
      ),
    };
  }
}
