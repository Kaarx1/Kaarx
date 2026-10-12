import type {
  AdminRole,
  BodyType,
  BookingStatus,
  CancelledBy,
  FuelType,
  InsuranceStatus,
  Language,
  OfferResponse,
  PaymentMethod,
  PaymentStatus,
  PhotoPhase,
  PhotoSide,
  Role,
  Transmission,
  VerificationStatus,
} from './enums';
import type { FareBreakdown } from './fare';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PlaceView extends LatLng {
  address: string;
  instructions: string | null;
}

export interface VehicleSnapshot {
  registrationNumber: string;
  brand: string;
  model: string;
  colour: string;
  bodyType: BodyType;
  fuel: FuelType;
  transmission: Transmission;
  insuranceStatus: InsuranceStatus;
  insuranceValidTill: string | null;
  notes: string | null;
}

export interface CustomerProfile {
  id: string;
  phone: string;
  fullName: string | null;
  email: string | null;
  preferredLanguage: Language;
  profileComplete: boolean;
}

export interface DriverSelfView {
  id: string;
  code: string;
  phone: string;
  fullName: string;
  photoUrl: string | null;
  verificationStatus: VerificationStatus;
  canDrive: boolean;
  ratingAvg: number;
  totalTrips: number;
}

export interface AdminProfile {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
}

export interface PublicDriver {
  id: string;
  displayName: string;
  photoUrl: string | null;
  ratingAvg: number;
  totalTrips: number;
  experienceYears: number;
  languages: string[];
  verified: true;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends TokenPair {
  role: Role;
  profile: CustomerProfile | DriverSelfView;
}

export interface AdminAuthResponse extends TokenPair {
  profile: AdminProfile;
}

export interface FareEstimateView {
  distanceM: number;
  durationS: number;
  breakdown: FareBreakdown;
}

export interface CustomerBookingView {
  id: string;
  code: string;
  status: BookingStatus;
  pickup: PlaceView;
  dropoff: PlaceView;
  vehicle: VehicleSnapshot;
  notes: string | null;
  estimate: {
    distanceM: number | null;
    durationS: number | null;
    farePaise: number;
    breakdown: FareBreakdown;
  };
  otpCode: string | null;
  driver: PublicDriver | null;
  assignedAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  final: {
    distanceM: number;
    durationS: number;
    farePaise: number;
    breakdown: FareBreakdown;
  } | null;
  payment: { method: PaymentMethod; status: PaymentStatus };
  cancellation: { by: CancelledBy; reason: string | null; feePaise: number } | null;
  createdAt: string;
}

export interface DriverBookingView {
  id: string;
  code: string;
  status: BookingStatus;
  pickup: PlaceView;
  dropoff: PlaceView;
  vehicle: VehicleSnapshot;
  notes: string | null;
  customer: { firstName: string; phone: string };
  estimate: {
    distanceM: number | null;
    durationS: number | null;
    farePaise: number;
    earningPaise: number;
  };
  final: { farePaise: number; earningPaise: number; breakdown: FareBreakdown } | null;
  paymentStatus: PaymentStatus;
  photos: { preTrip: PhotoSide[]; postTrip: PhotoSide[] };
  assignedAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

export interface OfferView {
  offerId: string;
  bookingId: string;
  expiresAt: string;
  distanceToPickupM: number | null;
  pickup: PlaceView;
  dropoff: PlaceView;
  vehicle: VehicleSnapshot;
  estimate: { distanceM: number | null; durationS: number | null; earningPaise: number };
}

export interface DriverLocationEvent {
  bookingId: string;
  lat: number;
  lng: number;
  heading: number | null;
  recordedAt: string;
}

export interface PhotoUploadSlot {
  side: PhotoSide;
  key: string;
  uploadUrl: string;
}

export interface OnlineDriverView {
  driverId: string;
  code: string;
  fullName: string;
  phone: string;
  lat: number;
  lng: number;
  lastSeenAt: string;
}

export interface SosAdminView {
  id: string;
  status: 'open' | 'handled';
  createdAt: string;
  raisedBy: { type: Role; id: string; name: string; phone: string };
  booking: { id: string; code: string; status: BookingStatus } | null;
  location: LatLng | null;
  notes: string | null;
}

export interface AdminBookingRow {
  id: string;
  code: string;
  status: BookingStatus;
  createdAt: string;
  pickupAddress: string;
  dropoffAddress: string;
  estimatedFarePaise: number;
  finalFarePaise: number | null;
  customerName: string | null;
  customerPhone: string;
  driverName: string | null;
  driverPhone: string | null;
  vehicleNumber: string;
}

export interface AdminBookingDetail {
  booking: CustomerBookingView;
  customer: { id: string; name: string | null; phone: string };
  driverPhone: string | null;
  events: {
    eventType: string;
    actorType: Role | null;
    actorId: string | null;
    payload: Record<string, unknown>;
    createdAt: string;
  }[];
  offers: {
    driverId: string;
    driverName: string;
    round: number;
    response: OfferResponse;
    distanceToPickupM: number | null;
    offeredAt: string;
    respondedAt: string | null;
  }[];
  photos: { phase: PhotoPhase; side: PhotoSide; url: string; takenAt: string }[];
}
