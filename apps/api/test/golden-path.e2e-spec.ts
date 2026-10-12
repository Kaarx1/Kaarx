import type { Socket } from 'socket.io-client';
import type {
  AuthResponse,
  CustomerBookingView,
  CustomerProfile,
  DriverBookingView,
  DriverLocationEvent,
  FareEstimateView,
  OfferView,
} from '@kaarx/shared';
import { api, bearer, createTestApp, resetState, type TestContext } from './helpers/test-app';
import {
  insertApprovedDriver,
  PLACES,
  setOfferTimeout,
  uniquePhone,
  uploadTripPhotos,
  VALID_VEHICLE,
} from './helpers/factories';
import { connectSocket, nextEvent } from './helpers/sockets';

jest.setTimeout(60_000);

const FIXED_CODE = '123456';
const TRIP_POINTS = [
  { lat: 17.4325, lng: 78.4071 },
  { lat: 17.4445, lng: 78.4071 },
  { lat: 17.4565, lng: 78.4071 },
];

let ctx: TestContext;
const sockets: Socket[] = [];

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetState(ctx);
});
afterEach(() => {
  sockets.splice(0).forEach((socket) => socket.disconnect());
});

async function socketFor(token: string): Promise<Socket> {
  const socket = await connectSocket(ctx, token);
  sockets.push(socket);
  return socket;
}

async function otpLogin(app: 'customer' | 'driver', phone: string): Promise<AuthResponse> {
  await api(ctx).post('/auth/otp/request').send({ phone, app }).expect(204);
  const res = await api(ctx)
    .post('/auth/otp/verify')
    .send({ phone, app, code: FIXED_CODE })
    .expect(200);
  return res.body as AuthResponse;
}

it('golden path: signup → book → offer → trip → cash paid', async () => {
  await setOfferTimeout(ctx, 10);

  // Customer signs up and completes the profile.
  const customerAuth = await otpLogin('customer', uniquePhone());
  expect(customerAuth.role).toBe('customer');
  const customer = bearer(customerAuth.accessToken);

  const profile = await api(ctx)
    .patch('/customer/me')
    .set(customer)
    .send({ fullName: 'Priya Sharma', ageConfirmed: true })
    .expect(200);
  expect((profile.body as CustomerProfile).profileComplete).toBe(true);

  const vehicle = await api(ctx)
    .post('/customer/vehicles')
    .set(customer)
    .send(VALID_VEHICLE)
    .expect(201);
  const vehicleId = vehicle.body.id as string;

  const estimate = await api(ctx)
    .post('/customer/fare-estimate')
    .set(customer)
    .send({
      pickup: { lat: PLACES.jubileeHills.lat, lng: PLACES.jubileeHills.lng },
      dropoff: { lat: PLACES.fourKmNorth.lat, lng: PLACES.fourKmNorth.lng },
      vehicleId,
    })
    .expect(200);
  const estimateView = estimate.body as FareEstimateView;
  expect(estimateView.breakdown.totalPaise).toBeGreaterThan(0);

  // Driver logs in and goes online near the pickup.
  const driverRecord = await insertApprovedDriver(ctx);
  const driverAuth = await otpLogin('driver', driverRecord.phone);
  expect(driverAuth.role).toBe('driver');
  const driver = bearer(driverAuth.accessToken);
  await api(ctx)
    .post('/driver/online')
    .set(driver)
    .send({ lat: PLACES.nearJubilee.lat, lng: PLACES.nearJubilee.lng })
    .expect(200);

  const driverSocket = await socketFor(driverAuth.accessToken);
  const customerSocket = await socketFor(customerAuth.accessToken);

  // Customer books; the driver gets the offer and accepts.
  const offerNew = nextEvent<OfferView>(driverSocket, 'offer.new');
  const created = await api(ctx)
    .post('/customer/bookings')
    .set(customer)
    .send({ pickup: PLACES.jubileeHills, dropoff: PLACES.fourKmNorth, vehicleId })
    .expect(201);
  const booking = created.body as CustomerBookingView;
  expect(booking.status).toBe('searching');
  expect(booking.estimate.farePaise).toBe(estimateView.breakdown.totalPaise);

  const offer = await offerNew;
  expect(offer.bookingId).toBe(booking.id);

  const assignedEvent = nextEvent<CustomerBookingView>(
    customerSocket,
    'booking.updated',
    (view) => view.id === booking.id && view.status === 'assigned',
  );
  const accepted = await api(ctx)
    .post(`/driver/offers/${offer.offerId}/accept`)
    .set(driver)
    .expect(200);
  expect((accepted.body as DriverBookingView).status).toBe('assigned');
  const assigned = await assignedEvent;
  expect(assigned.driver?.id).toBe(driverRecord.id);
  expect(assigned.otpCode).toMatch(/^\d{4}$/);

  // Pickup: arrive, pre-trip photos, OTP start.
  const trip = (action: string) => `/driver/bookings/${booking.id}/${action}`;
  await api(ctx).post(trip('arrived')).set(driver).expect(200);
  await uploadTripPhotos(ctx, driverAuth.accessToken, booking.id, 'pre_trip');
  const started = await api(ctx)
    .post(trip('start'))
    .set(driver)
    .send({ otp: assigned.otpCode })
    .expect(200);
  expect((started.body as DriverBookingView).status).toBe('in_progress');

  // Live trip: each location point reaches the customer.
  const base = Date.now();
  for (const [i, point] of TRIP_POINTS.entries()) {
    const seen = nextEvent<DriverLocationEvent>(
      customerSocket,
      'driver.location',
      (event) => event.bookingId === booking.id && event.lat === point.lat,
    );
    await api(ctx)
      .post('/driver/locations')
      .set(driver)
      .send({ points: [{ ...point, recordedAt: new Date(base + (i + 1) * 1000).toISOString() }] })
      .expect(202);
    expect((await seen).lng).toBe(point.lng);
  }

  // Drop-off: post-trip photos, end, cash.
  await uploadTripPhotos(ctx, driverAuth.accessToken, booking.id, 'post_trip');
  const ended = await api(ctx).post(trip('end')).set(driver).expect(200);
  const endedView = ended.body as DriverBookingView;
  expect(endedView.status).toBe('completed');
  expect(endedView.final?.farePaise).toBe(23000);

  const paid = await api(ctx).post(trip('cash-collected')).set(driver).expect(200);
  expect((paid.body as DriverBookingView).paymentStatus).toBe('paid');

  const finalView = await api(ctx)
    .get(`/customer/bookings/${booking.id}`)
    .set(customer)
    .expect(200);
  expect(finalView.body as CustomerBookingView).toMatchObject({
    status: 'completed',
    otpCode: null,
    payment: { method: 'cash', status: 'paid' },
    final: { farePaise: 23000 },
  });
});
