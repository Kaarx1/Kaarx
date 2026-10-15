import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import {
  REALTIME_EVENTS,
  REQUIRED_PHOTO_SIDES,
  todayIsoDateIST,
  type AdminRole,
  type AppKind,
  type AuthResponse,
  type CreateBookingInput,
  type CustomerBookingView,
  type OfferView,
  type PhotoPhase,
  type PhotoUploadSlot,
} from '@kaarx/shared';
import { connectSocket, nextEvent } from './sockets';
import { AdminUser, Driver } from '../../src/database/entities';
import { FIXED_OTP } from '../../src/modules/auth/services/otp.service';
import { api, bearer, type TestContext } from './test-app';

export const HYDERABAD_CITY_ID = '00000000-0000-0000-0000-000000000001';

export interface TestPlace {
  lat: number;
  lng: number;
  address: string;
}

export const PLACES: Record<
  'jubileeHills' | 'nearJubilee' | 'fourKmNorth' | 'airport' | 'outsideZone' | 'vijayawada',
  TestPlace
> = {
  jubileeHills: { lat: 17.4325, lng: 78.4071, address: 'Road No. 36, Jubilee Hills, Hyderabad' },
  nearJubilee: { lat: 17.4301, lng: 78.4102, address: 'Film Nagar, Jubilee Hills, Hyderabad' },
  fourKmNorth: { lat: 17.4685, lng: 78.4071, address: 'Moosapet, Hyderabad' },
  airport: {
    lat: 17.2403,
    lng: 78.4294,
    address: 'Rajiv Gandhi International Airport, Shamshabad',
  },
  outsideZone: { lat: 18.0, lng: 79.5, address: 'Warangal Rural, Telangana' },
  vijayawada: { lat: 16.5062, lng: 80.648, address: 'Benz Circle, Vijayawada' },
};

let phoneCounter = 0;
const phoneRunPrefix = String(Math.floor(Math.random() * 10_000)).padStart(4, '0');

export function uniquePhone(): string {
  phoneCounter += 1;
  return `+919${phoneRunPrefix}${String(phoneCounter).padStart(5, '0')}`;
}

export function isoDaysAgo(days: number): string {
  return todayIsoDateIST(new Date(Date.now() - days * 86_400_000));
}

export async function insertApprovedDriver(
  ctx: TestContext,
  overrides: Partial<Driver> = {},
): Promise<Driver> {
  const repo = ctx.ds.getRepository(Driver);
  const now = new Date();
  const saved = await repo.save(
    repo.create({
      phone: uniquePhone(),
      fullName: 'Ravi Kumar',
      dob: isoDaysAgo(365 * 30),
      gender: 'male',
      preferredLanguage: 'en',
      languages: ['Telugu', 'Hindi', 'English'],
      currentAddress: 'Plot 12, Road No. 5, Banjara Hills, Hyderabad',
      emergencyContactName: 'Lakshmi Kumar',
      emergencyContactPhone: uniquePhone(),
      experienceYears: 6,
      transmission: 'both',
      bodyTypes: ['hatchback', 'sedan', 'suv', 'muv'],
      evExperience: true,
      verificationStatus: 'approved',
      activatedAt: now,
      trainingCompletedAt: now,
      agreementVersion: 'v1',
      agreementSignedAt: now,
      codeOfConductSignedAt: now,
      status: 'active',
      ...overrides,
    }),
  );
  return repo.findOneByOrFail({ id: saved.id });
}

export async function loginWithOtp(
  ctx: TestContext,
  app: AppKind,
  phone: string,
): Promise<AuthResponse> {
  await api(ctx).post('/auth/otp/request').send({ phone, app }).expect(204);
  const res = await api(ctx)
    .post('/auth/otp/verify')
    .send({ phone, app, code: FIXED_OTP })
    .expect(200);
  return res.body as AuthResponse;
}

export async function loginCustomer(
  ctx: TestContext,
  phone: string = uniquePhone(),
): Promise<{ token: string; refreshToken: string; id: string; phone: string }> {
  const auth = await loginWithOtp(ctx, 'customer', phone);
  return {
    token: auth.accessToken,
    refreshToken: auth.refreshToken,
    id: auth.profile.id,
    phone: auth.profile.phone,
  };
}

export async function loginDriver(ctx: TestContext, driver: Driver): Promise<string> {
  const auth = await loginWithOtp(ctx, 'driver', driver.phone);
  return auth.accessToken;
}

export const ADMIN_PASSWORD = 'kaarx-admin-pass-123';
let adminPasswordHash: Promise<string> | undefined;

export async function insertAdmin(
  ctx: TestContext,
  role: AdminRole = 'super_admin',
): Promise<AdminUser> {
  adminPasswordHash ??= argon2.hash(ADMIN_PASSWORD);
  const repo = ctx.ds.getRepository(AdminUser);
  return repo.save(
    repo.create({
      email: `admin-${randomUUID()}@kaarx.test`,
      passwordHash: await adminPasswordHash,
      fullName: 'Test Admin',
      role,
    }),
  );
}

export async function loginAdmin(
  ctx: TestContext,
  role: AdminRole = 'super_admin',
): Promise<{ token: string; admin: AdminUser }> {
  const admin = await insertAdmin(ctx, role);
  const res = await api(ctx)
    .post('/admin/auth/login')
    .send({ email: admin.email, password: ADMIN_PASSWORD })
    .expect(200);
  return { token: res.body.accessToken as string, admin };
}

export const VALID_VEHICLE = {
  registrationNumber: 'TS 09 AB 1234',
  brand: 'Maruti Suzuki',
  model: 'Swift',
  colour: 'White',
  bodyType: 'hatchback',
  fuel: 'petrol',
  transmission: 'manual',
  insuranceStatus: 'insured',
  insuranceValidTill: '2099-12-31',
  ownershipDeclared: true,
} as const;

let registrationSeq = 0;
function nextRegistrationNumber(): string {
  registrationSeq += 1;
  return `TS10CD${String(1000 + (registrationSeq % 9000))}`;
}

export async function loginReadyCustomer(
  ctx: TestContext,
): Promise<{ token: string; refreshToken: string; id: string; phone: string }> {
  const customer = await loginCustomer(ctx);
  await api(ctx)
    .patch('/customer/me')
    .set(bearer(customer.token))
    .send({ fullName: 'Asha Reddy', ageConfirmed: true })
    .expect(200);
  return customer;
}

export async function addVehicle(
  ctx: TestContext,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; registrationNumber: string } & Record<string, unknown>> {
  const res = await api(ctx)
    .post('/customer/vehicles')
    .set(bearer(token))
    .send({ ...VALID_VEHICLE, registrationNumber: nextRegistrationNumber(), ...overrides })
    .expect(201);
  return res.body as { id: string; registrationNumber: string } & Record<string, unknown>;
}

export function validDriverInput() {
  return {
    phone: uniquePhone(),
    fullName: 'Ravi Kumar',
    dob: isoDaysAgo(365 * 30),
    gender: 'male',
    preferredLanguage: 'te',
    languages: ['Telugu', 'Hindi', 'English'],
    currentAddress: 'Plot 12, Road 5, Jubilee Hills, Hyderabad',
    emergencyContactName: 'Lakshmi Kumar',
    emergencyContactRelation: 'Spouse',
    emergencyContactPhone: '98480 12345',
    experienceYears: 6,
    transmission: 'both',
    bodyTypes: ['hatchback', 'sedan', 'suv'],
    evExperience: false,
  };
}

export async function onlineDriver(
  ctx: TestContext,
  overrides: Partial<Driver> = {},
  point: { lat: number; lng: number } = PLACES.nearJubilee,
): Promise<{ driver: Driver; token: string }> {
  const driver = await insertApprovedDriver(ctx, overrides);
  const token = await loginDriver(ctx, driver);
  await api(ctx)
    .post('/driver/online')
    .set(bearer(token))
    .send({ lat: point.lat, lng: point.lng })
    .expect(200);
  return { driver, token };
}

export async function setOfferTimeout(ctx: TestContext, seconds: number): Promise<void> {
  await ctx.ds.query('update dispatch_settings set offer_timeout_sec = $1 where city_id = $2', [
    seconds,
    HYDERABAD_CITY_ID,
  ]);
}

export async function createBooking(
  ctx: TestContext,
  customerToken: string,
  vehicleId: string,
  overrides: Partial<CreateBookingInput> = {},
): Promise<CustomerBookingView> {
  const res = await api(ctx)
    .post('/customer/bookings')
    .set(bearer(customerToken))
    .send({ pickup: PLACES.jubileeHills, dropoff: PLACES.airport, vehicleId, ...overrides })
    .expect(201);
  return res.body as CustomerBookingView;
}

export async function bookAndAssign(
  ctx: TestContext,
  opts: {
    offerTimeoutSec?: number;
    driverOverrides?: Partial<Driver>;
    driverPoint?: { lat: number; lng: number };
    vehicleOverrides?: Parameters<typeof addVehicle>[2];
  } = {},
): Promise<{
  customer: Awaited<ReturnType<typeof loginReadyCustomer>>;
  vehicle: Awaited<ReturnType<typeof addVehicle>>;
  booking: CustomerBookingView;
  driver: Driver;
  driverToken: string;
}> {
  await setOfferTimeout(ctx, opts.offerTimeoutSec ?? 10);
  const customer = await loginReadyCustomer(ctx);
  const vehicle = await addVehicle(ctx, customer.token, opts.vehicleOverrides);
  const { driver, token: driverToken } = await onlineDriver(
    ctx,
    opts.driverOverrides,
    opts.driverPoint,
  );
  const driverSocket = await connectSocket(ctx, driverToken);
  let bookingId: string;
  try {
    const offered = nextEvent<OfferView>(driverSocket, REALTIME_EVENTS.offerNew);
    bookingId = (await createBooking(ctx, customer.token, vehicle.id)).id;
    const offer = await offered;
    await api(ctx)
      .post(`/driver/offers/${offer.offerId}/accept`)
      .set(bearer(driverToken))
      .expect(200);
  } finally {
    driverSocket.close();
  }
  const res = await api(ctx)
    .get(`/customer/bookings/${bookingId}`)
    .set(bearer(customer.token))
    .expect(200);
  return { customer, vehicle, booking: res.body as CustomerBookingView, driver, driverToken };
}

export type AssignedTrip = Awaited<ReturnType<typeof bookAndAssign>>;

export async function uploadTripPhotos(
  ctx: TestContext,
  driverToken: string,
  bookingId: string,
  phase: PhotoPhase,
): Promise<void> {
  const slots = await api(ctx)
    .post(`/driver/bookings/${bookingId}/photo-uploads`)
    .set(bearer(driverToken))
    .send({ phase, sides: [...REQUIRED_PHOTO_SIDES] })
    .expect(200);
  await api(ctx)
    .post(`/driver/bookings/${bookingId}/photos`)
    .set(bearer(driverToken))
    .send({
      phase,
      photos: (slots.body as PhotoUploadSlot[]).map((slot) => ({
        side: slot.side,
        key: slot.key,
        takenAt: new Date().toISOString(),
      })),
    })
    .expect(200);
}

export async function customerOtp(ctx: TestContext, trip: AssignedTrip): Promise<string> {
  const res = await api(ctx)
    .get(`/customer/bookings/${trip.booking.id}`)
    .set(bearer(trip.customer.token))
    .expect(200);
  const { otpCode } = res.body as CustomerBookingView;
  if (!otpCode) throw new Error(`No OTP visible for booking ${trip.booking.id}`);
  return otpCode;
}

export async function startTrip(ctx: TestContext, trip: AssignedTrip): Promise<void> {
  await api(ctx)
    .post(`/driver/bookings/${trip.booking.id}/arrived`)
    .set(bearer(trip.driverToken))
    .expect(200);
  await uploadTripPhotos(ctx, trip.driverToken, trip.booking.id, 'pre_trip');
  await api(ctx)
    .post(`/driver/bookings/${trip.booking.id}/start`)
    .set(bearer(trip.driverToken))
    .send({ otp: await customerOtp(ctx, trip) })
    .expect(200);
}
