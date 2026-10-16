import { Injectable, NotFoundException } from '@nestjs/common';
import type { AdminBookingDetail, AdminBookingRow, AdminBookingsQuery } from '@kaarx/shared';
import {
  BookingEventRepository,
  BookingOfferRepository,
  BookingRepository,
  CustomerRepository,
  DriverRepository,
  TripPhotoRepository,
} from '../../../database/repositories';
import { BookingViewsService } from '../../bookings/services/booking-views.service';
import { StorageService } from '../../storage/services/storage.service';

const MAX_ROWS = 100;
const MIN_PHONE_DIGITS = 4;

@Injectable()
export class AdminBookingsService {
  constructor(
    private readonly bookingRepo: BookingRepository,
    private readonly customerRepo: CustomerRepository,
    private readonly driverRepo: DriverRepository,
    private readonly eventRepo: BookingEventRepository,
    private readonly offerRepo: BookingOfferRepository,
    private readonly photoRepo: TripPhotoRepository,
    private readonly views: BookingViewsService,
    private readonly storage: StorageService,
  ) {}

  async list(query: AdminBookingsQuery): Promise<AdminBookingRow[]> {
    const q = query.q ?? null;
    const phoneDigits = q ? q.replace(/\D/g, '') : '';
    const rows = await this.bookingRepo.findAdminPage(
      {
        status: query.status ?? null,
        code: q ? `%${q}%` : null,
        vehicleNumber: q ? `%${q.replace(/[\s-]/g, '').toUpperCase()}%` : null,
        phone: phoneDigits.length >= MIN_PHONE_DIGITS ? `%${phoneDigits}%` : null,
      },
      MAX_ROWS,
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
    const booking = await this.bookingRepo.findById(id);
    if (!booking) throw new NotFoundException('Booking not found');

    const [view, customer, driver, events, offers, photos] = await Promise.all([
      this.views.customerView(booking),
      this.customerRepo.findById(booking.customerId),
      booking.driverId ? this.driverRepo.findById(booking.driverId) : null,
      this.eventRepo.findByBooking(id),
      this.offerRepo.findByBooking(id),
      this.photoRepo.findByBooking(id),
    ]);

    if (!customer) throw new NotFoundException('Booking not found');

    return {
      booking: view,
      customer: { id: customer.id, name: customer.fullName, phone: customer.phone },
      driverPhone: driver?.phone ?? null,
      events: events.map((event) => ({
        eventType: event.eventType,
        actorType: event.actorType,
        actorId: event.actorId,
        payload: event.payload,
        createdAt: event.createdAt.toISOString(),
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
