export const BOOKING_STATUSES = [
  'searching',
  'assigned',
  'driver_arrived',
  'in_progress',
  'completed',
  'cancelled',
  'no_driver_found',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const LIVE_BOOKING_STATUSES = [
  'assigned',
  'driver_arrived',
  'in_progress',
] as const satisfies readonly BookingStatus[];

export const TRANSMISSIONS = ['manual', 'automatic'] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];

export const DRIVER_TRANSMISSIONS = ['manual', 'automatic', 'both'] as const;
export type DriverTransmission = (typeof DRIVER_TRANSMISSIONS)[number];

export const BODY_TYPES = ['hatchback', 'sedan', 'suv', 'muv', 'luxury'] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export const FUEL_TYPES = ['petrol', 'diesel', 'cng', 'electric', 'hybrid'] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const INSURANCE_STATUSES = ['insured', 'not_insured'] as const;
export type InsuranceStatus = (typeof INSURANCE_STATUSES)[number];

export const LANGUAGES = ['en', 'te', 'hi'] as const;
export type Language = (typeof LANGUAGES)[number];

export const GENDERS = ['male', 'female', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

export const APP_KINDS = ['customer', 'driver'] as const;
export type AppKind = (typeof APP_KINDS)[number];

export const ROLES = ['customer', 'driver', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ADMIN_ROLES = [
  'super_admin',
  'ops_manager',
  'verification_agent',
  'support_agent',
  'finance',
  'read_only',
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const VERIFICATION_STATUSES = [
  'pending',
  'documents_submitted',
  'under_review',
  'approved',
  'rejected',
  'suspended',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const DOCUMENT_TYPES = [
  'driving_licence',
  'aadhaar',
  'pan',
  'police_verification',
  'address_proof',
  'medical_certificate',
  'psychological_assessment',
  'photo',
  'bank_proof',
  'background_check',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const REQUIRED_DRIVER_DOCUMENTS = [
  'driving_licence',
  'aadhaar',
  'pan',
  'police_verification',
] as const satisfies readonly DocumentType[];

export const DOCUMENT_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const PHOTO_PHASES = ['pre_trip', 'post_trip'] as const;
export type PhotoPhase = (typeof PHOTO_PHASES)[number];

export const PHOTO_SIDES = ['front', 'rear', 'left', 'right', 'dashboard', 'other'] as const;
export type PhotoSide = (typeof PHOTO_SIDES)[number];

export const REQUIRED_PHOTO_SIDES = [
  'front',
  'rear',
  'left',
  'right',
  'dashboard',
] as const satisfies readonly PhotoSide[];

export const OFFER_RESPONSES = ['pending', 'accepted', 'declined', 'expired'] as const;
export type OfferResponse = (typeof OFFER_RESPONSES)[number];

export const CANCELLED_BY = ['customer', 'driver', 'admin', 'system'] as const;
export type CancelledBy = (typeof CANCELLED_BY)[number];

export const DRIVER_CANCEL_REASONS = [
  'customer_no_show',
  'vehicle_unsafe',
  'customer_intoxicated',
  'personal_emergency',
  'other',
] as const;
export type DriverCancelReason = (typeof DRIVER_CANCEL_REASONS)[number];

export const PAYMENT_METHODS = ['cash', 'upi'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
