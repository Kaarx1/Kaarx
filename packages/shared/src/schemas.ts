import { z } from 'zod';
import { ageInYears, todayIsoDateIST } from './dates';
import {
  APP_KINDS,
  BODY_TYPES,
  BOOKING_STATUSES,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  DRIVER_CANCEL_REASONS,
  DRIVER_TRANSMISSIONS,
  FUEL_TYPES,
  GENDERS,
  INSURANCE_STATUSES,
  LANGUAGES,
  PHOTO_PHASES,
  PHOTO_SIDES,
  TRANSMISSIONS,
  VERIFICATION_STATUSES,
} from './enums';
import { normalizeIndianMobile } from './phone';
import { normalizeRegistrationNumber } from './registration';

export const MIN_DRIVER_AGE = 21;
export const MIN_DRIVER_EXPERIENCE_YEARS = 2;

const PHONE_MESSAGE = 'Enter a valid 10-digit Indian mobile number';
const REGISTRATION_MESSAGE = 'Enter a valid vehicle number, e.g. TS 09 AB 1234';

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

export const phoneSchema = z.string({ error: PHONE_MESSAGE }).transform((value, ctx) => {
  const phone = normalizeIndianMobile(value);
  if (!phone) {
    ctx.addIssue({ code: 'custom', message: PHONE_MESSAGE });
    return z.NEVER;
  }
  return phone;
});

export const registrationNumberSchema = z
  .string({ error: REGISTRATION_MESSAGE })
  .transform((value, ctx) => {
    const registration = normalizeRegistrationNumber(value);
    if (!registration) {
      ctx.addIssue({ code: 'custom', message: REGISTRATION_MESSAGE });
      return z.NEVER;
    }
    return registration;
  });

export const latLngSchema = z.object({ lat: latitude, lng: longitude });
export type LatLngInput = z.infer<typeof latLngSchema>;

export const placeSchema = latLngSchema.extend({
  address: z.string().trim().min(3).max(300),
  instructions: z.string().trim().max(200).optional(),
});
export type PlaceInput = z.infer<typeof placeSchema>;

export const requestOtpSchema = z.object({
  phone: phoneSchema,
  app: z.enum(APP_KINDS),
});
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = requestOtpSchema.extend({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const refreshTokenSchema = z.object({ refreshToken: z.string().min(20) });
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const adminLoginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(60),
  email: z.email().optional(),
  preferredLanguage: z.enum(LANGUAGES).optional(),
  ageConfirmed: z.literal(true).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const vehicleSchema = z
  .object({
    registrationNumber: registrationNumberSchema,
    brand: z.string().trim().min(1).max(40),
    model: z.string().trim().min(1).max(40),
    colour: z.string().trim().min(1).max(30),
    bodyType: z.enum(BODY_TYPES),
    fuel: z.enum(FUEL_TYPES),
    transmission: z.enum(TRANSMISSIONS),
    insuranceStatus: z.enum(INSURANCE_STATUSES),
    insuranceValidTill: z.iso.date().optional(),
    insurerName: z.string().trim().max(60).optional(),
    notes: z.string().trim().max(200).optional(),
    ownershipDeclared: z.literal(true),
  })
  .refine((v) => v.insuranceStatus !== 'insured' || v.insuranceValidTill !== undefined, {
    message: 'Insurance valid-till date is required for an insured vehicle',
    path: ['insuranceValidTill'],
  })
  .refine((v) => v.insuranceValidTill === undefined || v.insuranceValidTill >= todayIsoDateIST(), {
    message: 'Insurance has already expired',
    path: ['insuranceValidTill'],
  });
export type VehicleInput = z.infer<typeof vehicleSchema>;

export const emergencyContactsSchema = z.object({
  contacts: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(60),
        phone: phoneSchema,
        relation: z.string().trim().max(30).optional(),
      }),
    )
    .max(3),
});
export type EmergencyContactsInput = z.infer<typeof emergencyContactsSchema>;

export const fareEstimateSchema = z.object({
  pickup: latLngSchema,
  dropoff: latLngSchema,
  vehicleId: z.uuid(),
});
export type FareEstimateInput = z.infer<typeof fareEstimateSchema>;

export const createBookingSchema = z.object({
  pickup: placeSchema,
  dropoff: placeSchema,
  vehicleId: z.uuid(),
  notes: z.string().trim().max(200).optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const customerBookingsQuerySchema = z.object({
  scope: z.enum(['active', 'past']).default('active'),
});
export type CustomerBookingsQuery = z.infer<typeof customerBookingsQuerySchema>;

export const cancelBookingSchema = z.object({ reason: z.string().trim().min(2).max(200) });
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const goOnlineSchema = latLngSchema;
export type GoOnlineInput = z.infer<typeof goOnlineSchema>;

export const locationPointSchema = latLngSchema.extend({
  recordedAt: z.coerce.date(),
  speedMps: z.number().min(0).optional(),
  heading: z.number().min(0).max(360).optional(),
  accuracyM: z.number().min(0).optional(),
});
export type LocationPointInput = z.infer<typeof locationPointSchema>;

export const locationBatchSchema = z.object({
  points: z.array(locationPointSchema).min(1).max(100),
});
export type LocationBatchInput = z.infer<typeof locationBatchSchema>;

export const declineOfferSchema = z.object({ reason: z.string().trim().max(100).optional() });
export type DeclineOfferInput = z.infer<typeof declineOfferSchema>;

export const photoUploadRequestSchema = z.object({
  phase: z.enum(PHOTO_PHASES),
  sides: z.array(z.enum(PHOTO_SIDES)).min(1).max(8),
});
export type PhotoUploadRequestInput = z.infer<typeof photoUploadRequestSchema>;

export const recordPhotosSchema = z.object({
  phase: z.enum(PHOTO_PHASES),
  photos: z
    .array(
      z.object({
        side: z.enum(PHOTO_SIDES),
        key: z.string().startsWith('trips/'),
        takenAt: z.coerce.date(),
        lat: latitude.optional(),
        lng: longitude.optional(),
      }),
    )
    .min(1)
    .max(8),
});
export type RecordPhotosInput = z.infer<typeof recordPhotosSchema>;

export const startTripSchema = z.object({
  otp: z.string().regex(/^\d{4}$/, 'Enter the 4-digit trip code'),
});
export type StartTripInput = z.infer<typeof startTripSchema>;

export const driverCancelSchema = z.object({
  reason: z.enum(DRIVER_CANCEL_REASONS),
  notes: z.string().trim().max(200).optional(),
});
export type DriverCancelInput = z.infer<typeof driverCancelSchema>;

export const createDriverSchema = z
  .object({
    phone: phoneSchema,
    fullName: z.string().trim().min(2).max(80),
    dob: z.iso.date(),
    gender: z.enum(GENDERS),
    email: z.email().optional(),
    preferredLanguage: z.enum(LANGUAGES).default('en'),
    languages: z.array(z.string().trim().min(2).max(20)).min(1),
    currentAddress: z.string().trim().min(10).max(300),
    permanentAddress: z.string().trim().min(10).max(300).optional(),
    emergencyContactName: z.string().trim().min(2).max(60),
    emergencyContactRelation: z.string().trim().max(30).optional(),
    emergencyContactPhone: phoneSchema,
    experienceYears: z.number().min(0).max(60),
    transmission: z.enum(DRIVER_TRANSMISSIONS),
    bodyTypes: z.array(z.enum(BODY_TYPES)).min(1),
    evExperience: z.boolean().default(false),
    previousPlatform: z.string().trim().max(60).optional(),
    photoUrl: z.url().optional(),
  })
  .refine((v) => ageInYears(v.dob, todayIsoDateIST()) >= MIN_DRIVER_AGE, {
    message: `Driver must be at least ${MIN_DRIVER_AGE} years old`,
    path: ['dob'],
  })
  .refine((v) => v.experienceYears >= MIN_DRIVER_EXPERIENCE_YEARS, {
    message: `Driver needs at least ${MIN_DRIVER_EXPERIENCE_YEARS} years of driving experience`,
    path: ['experienceYears'],
  });
export type CreateDriverInput = z.infer<typeof createDriverSchema>;

export const driverDocumentSchema = z
  .object({
    type: z.enum(DOCUMENT_TYPES),
    numberMasked: z.string().trim().max(30).optional(),
    issueDate: z.iso.date().optional(),
    expiryDate: z.iso.date().optional(),
    fileUrls: z.array(z.string().trim().min(1).max(500)).max(4).default([]),
    status: z.enum(DOCUMENT_STATUSES).default('pending'),
    rejectionReason: z.string().trim().min(2).max(200).optional(),
  })
  .refine(
    (v) => v.type !== 'aadhaar' || (v.numberMasked !== undefined && /^\d{4}$/.test(v.numberMasked)),
    { message: 'Store only the last 4 digits of Aadhaar', path: ['numberMasked'] },
  )
  .refine((v) => v.status !== 'rejected' || v.rejectionReason !== undefined, {
    message: 'Give a reason for rejecting this document',
    path: ['rejectionReason'],
  });
export type DriverDocumentInput = z.infer<typeof driverDocumentSchema>;

export const driverOnboardingSchema = z.object({
  trainingCompletedAt: z.coerce.date().optional(),
  agreementVersion: z.string().trim().min(1).max(20).optional(),
  agreementSignedAt: z.coerce.date().optional(),
  codeOfConductSignedAt: z.coerce.date().optional(),
  idCardNumber: z.string().trim().min(1).max(30).optional(),
});
export type DriverOnboardingInput = z.infer<typeof driverOnboardingSchema>;

export const suspendDriverSchema = z.object({
  reason: z.string().trim().min(3).max(200),
  until: z.coerce.date().optional(),
});
export type SuspendDriverInput = z.infer<typeof suspendDriverSchema>;

export const adminDriversQuerySchema = z.object({
  status: z.enum(VERIFICATION_STATUSES).optional(),
});
export type AdminDriversQuery = z.infer<typeof adminDriversQuerySchema>;

export const sosSchema = z.object({
  bookingId: z.uuid().optional(),
  lat: latitude.optional(),
  lng: longitude.optional(),
});
export type SosInput = z.infer<typeof sosSchema>;

export const handleSosSchema = z.object({ notes: z.string().trim().min(2).max(500) });
export type HandleSosInput = z.infer<typeof handleSosSchema>;

export const adminBookingsQuerySchema = z.object({
  status: z.enum(BOOKING_STATUSES).optional(),
  q: z.string().trim().min(2).max(40).optional(),
});
export type AdminBookingsQuery = z.infer<typeof adminBookingsQuerySchema>;
