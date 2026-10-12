import type {
  BookingStatus,
  CustomerBookingView,
  DriverBookingView,
  OfferView,
  PhotoSide,
  PlaceView,
  PublicDriver,
} from '@kaarx/shared';
import type { Booking, BookingOffer } from '../../database/entities';
import { fromGeoPoint } from '../../database/entities/columns';

const OTP_VISIBLE_STATUSES: readonly BookingStatus[] = ['assigned', 'driver_arrived'];

const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);

function pickupView(b: Booking): PlaceView {
  const { lat, lng } = fromGeoPoint(b.pickupLocation);
  return { lat, lng, address: b.pickupAddress, instructions: b.pickupInstructions };
}

function dropoffView(b: Booking): PlaceView {
  const { lat, lng } = fromGeoPoint(b.dropoffLocation);
  return { lat, lng, address: b.dropoffAddress, instructions: null };
}

export function toCustomerView(b: Booking, driver: PublicDriver | null): CustomerBookingView {
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    pickup: pickupView(b),
    dropoff: dropoffView(b),
    vehicle: b.vehicleSnapshot,
    notes: b.notes,
    estimate: {
      distanceM: b.estimatedDistanceM,
      durationS: b.estimatedDurationS,
      farePaise: b.estimatedFarePaise,
      breakdown: b.estimatedBreakdown,
    },
    otpCode: OTP_VISIBLE_STATUSES.includes(b.status) ? b.otpCode : null,
    driver,
    assignedAt: iso(b.assignedAt),
    arrivedAt: iso(b.arrivedAt),
    startedAt: iso(b.startedAt),
    endedAt: iso(b.endedAt),
    final:
      b.finalFarePaise !== null && b.finalBreakdown !== null
        ? {
            distanceM: b.actualDistanceM ?? 0,
            durationS: b.actualDurationS ?? 0,
            farePaise: b.finalFarePaise,
            breakdown: b.finalBreakdown,
          }
        : null,
    payment: { method: b.paymentMethod, status: b.paymentStatus },
    cancellation: b.cancelledBy
      ? { by: b.cancelledBy, reason: b.cancelReason, feePaise: b.cancellationFeePaise }
      : null,
    createdAt: b.createdAt.toISOString(),
  };
}

export function toDriverView(
  b: Booking,
  ctx: {
    customer: { firstName: string; phone: string };
    photos: { preTrip: PhotoSide[]; postTrip: PhotoSide[] };
    estimatedEarningPaise: number;
  },
): DriverBookingView {
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    pickup: pickupView(b),
    dropoff: dropoffView(b),
    vehicle: b.vehicleSnapshot,
    notes: b.notes,
    customer: ctx.customer,
    estimate: {
      distanceM: b.estimatedDistanceM,
      durationS: b.estimatedDurationS,
      farePaise: b.estimatedFarePaise,
      earningPaise: ctx.estimatedEarningPaise,
    },
    final:
      b.finalFarePaise !== null && b.finalBreakdown !== null
        ? {
            farePaise: b.finalFarePaise,
            earningPaise: b.driverEarningPaise ?? 0,
            breakdown: b.finalBreakdown,
          }
        : null,
    paymentStatus: b.paymentStatus,
    photos: ctx.photos,
    assignedAt: iso(b.assignedAt),
    arrivedAt: iso(b.arrivedAt),
    startedAt: iso(b.startedAt),
    endedAt: iso(b.endedAt),
  };
}

export function toOfferView(offer: BookingOffer, b: Booking, earningPaise: number): OfferView {
  return {
    offerId: offer.id,
    bookingId: b.id,
    expiresAt: offer.expiresAt.toISOString(),
    distanceToPickupM: offer.distanceToPickupM,
    pickup: pickupView(b),
    dropoff: dropoffView(b),
    vehicle: b.vehicleSnapshot,
    estimate: { distanceM: b.estimatedDistanceM, durationS: b.estimatedDurationS, earningPaise },
  };
}
