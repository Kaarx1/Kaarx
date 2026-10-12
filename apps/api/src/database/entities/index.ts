import { AdminUser } from './admin-user.entity';
import { BookingOffer } from './booking-offer.entity';
import { Booking } from './booking.entity';
import { Customer } from './customer.entity';
import { DispatchSettings } from './dispatch-settings.entity';
import { DriverDocument } from './driver-document.entity';
import { DriverSession } from './driver-session.entity';
import { Driver } from './driver.entity';
import { EmergencyContact } from './emergency-contact.entity';
import { PricingRule } from './pricing-rule.entity';
import { RefreshToken } from './refresh-token.entity';
import { SosEvent } from './sos-event.entity';
import { TripPhoto } from './trip-photo.entity';
import { Vehicle } from './vehicle.entity';

export * from './columns';
export {
  AdminUser,
  Booking,
  BookingOffer,
  Customer,
  DispatchSettings,
  Driver,
  DriverDocument,
  DriverSession,
  EmergencyContact,
  PricingRule,
  RefreshToken,
  SosEvent,
  TripPhoto,
  Vehicle,
};

export const ENTITIES = [
  AdminUser,
  Booking,
  BookingOffer,
  Customer,
  DispatchSettings,
  Driver,
  DriverDocument,
  DriverSession,
  EmergencyContact,
  PricingRule,
  RefreshToken,
  SosEvent,
  TripPhoto,
  Vehicle,
];
