import { AdminUserRepository } from './admin-user.repository';
import { BookingEventRepository } from './booking-event.repository';
import { BookingOfferRepository } from './booking-offer.repository';
import { BookingRepository } from './booking.repository';
import { CustomerRepository } from './customer.repository';
import { DispatchSettingsRepository } from './dispatch-settings.repository';
import { DriverDocumentRepository } from './driver-document.repository';
import { DriverLocationRepository } from './driver-location.repository';
import { DriverSessionRepository } from './driver-session.repository';
import { DriverRepository } from './driver.repository';
import { EmergencyContactRepository } from './emergency-contact.repository';
import { PricingRuleRepository } from './pricing-rule.repository';
import { RefreshTokenRepository } from './refresh-token.repository';
import { SosEventRepository } from './sos-event.repository';
import { TripPhotoRepository } from './trip-photo.repository';
import { VehicleRepository } from './vehicle.repository';
import { ZoneRepository } from './zone.repository';

export type { BookingEventRow } from './booking-event.repository';
export type {
  DeclinedOfferRow,
  ExpiredOfferRow,
  OfferDetailRow,
  OfferStateRow,
} from './booking-offer.repository';
export type {
  AdminBookingPageRow,
  AdminBookingSearch,
  BookingDispatchStateRow,
} from './booking.repository';
export type { SosRow } from './sos-event.repository';
export type { TripPhotoRow, TripPhotoSideRow } from './trip-photo.repository';
export type { ActiveZoneRow } from './zone.repository';

export {
  AdminUserRepository,
  BookingEventRepository,
  BookingOfferRepository,
  BookingRepository,
  CustomerRepository,
  DispatchSettingsRepository,
  DriverDocumentRepository,
  DriverLocationRepository,
  DriverRepository,
  DriverSessionRepository,
  EmergencyContactRepository,
  PricingRuleRepository,
  RefreshTokenRepository,
  SosEventRepository,
  TripPhotoRepository,
  VehicleRepository,
  ZoneRepository,
};

export const REPOSITORIES = [
  AdminUserRepository,
  BookingEventRepository,
  BookingOfferRepository,
  BookingRepository,
  CustomerRepository,
  DispatchSettingsRepository,
  DriverDocumentRepository,
  DriverLocationRepository,
  DriverRepository,
  DriverSessionRepository,
  EmergencyContactRepository,
  PricingRuleRepository,
  RefreshTokenRepository,
  SosEventRepository,
  TripPhotoRepository,
  VehicleRepository,
  ZoneRepository,
];
