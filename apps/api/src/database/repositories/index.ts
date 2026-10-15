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
