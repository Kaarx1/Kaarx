import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io-client';
import {
  REQUIRED_PHOTO_SIDES,
  type CustomerBookingView,
  type DriverBookingView,
  type DriverLocationEvent,
  type PhotoUploadSlot,
} from '@kaarx/shared';
import { api, bearer, createTestApp, resetState, type TestContext } from './helpers/test-app';
import {
  bookAndAssign,
  customerOtp,
  insertApprovedDriver,
  loginDriver,
  PLACES,
  startTrip,
  uploadTripPhotos,
  type AssignedTrip,
} from './helpers/factories';
import { connectSocket, nextEvent } from './helpers/sockets';

jest.setTimeout(30_000);

interface Point {
  lat: number;
  lng: number;
}

const ONE_KM_NORTH: Point = { lat: 17.4415, lng: 78.4071 };
const SORTED_REQUIRED_SIDES = [...REQUIRED_PHOTO_SIDES].sort();

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

function driverPost(trip: AssignedTrip, action: string, body: object = {}) {
  return api(ctx)
    .post(`/driver/bookings/${trip.booking.id}/${action}`)
    .set(bearer(trip.driverToken))
    .send(body);
}

function currentTrip(trip: AssignedTrip) {
  return api(ctx).get('/driver/bookings/current').set(bearer(trip.driverToken)).expect(200);
}

async function customerBooking(trip: AssignedTrip): Promise<CustomerBookingView> {
  const res = await api(ctx)
    .get(`/customer/bookings/${trip.booking.id}`)
    .set(bearer(trip.customer.token))
    .expect(200);
  return res.body as CustomerBookingView;
}

function wrongOtp(otp: string): string {
  return otp === '0000' ? '1111' : '0000';
}

async function sendPoints(trip: AssignedTrip, points: Point[]): Promise<void> {
  const base = Date.now();
  await api(ctx)
    .post('/driver/locations')
    .set(bearer(trip.driverToken))
    .send({
      points: points.map((p, i) => ({
        lat: p.lat,
        lng: p.lng,
        recordedAt: new Date(base + (i + 1) * 1000).toISOString(),
      })),
    })
    .expect(202);
}

async function endTrip(trip: AssignedTrip): Promise<DriverBookingView> {
  await uploadTripPhotos(ctx, trip.driverToken, trip.booking.id, 'post_trip');
  const res = await driverPost(trip, 'end').expect(200);
  return res.body as DriverBookingView;
}

async function fareComputed(bookingId: string): Promise<Record<string, unknown> | undefined> {
  const rows: { payload: Record<string, unknown> }[] = await ctx.ds.query(
    `select payload from booking_events where booking_id = $1 and event_type = 'fare.computed'`,
    [bookingId],
  );
  expect(rows).toHaveLength(1);
  return rows[0]?.payload;
}

describe('driver trip flow', () => {
  it('runs arrived → photos → OTP start → live location → end', async () => {
    const trip = await bookAndAssign(ctx);
    const customerSocket = await socketFor(trip.customer.token);

    const arrived = await driverPost(trip, 'arrived').expect(200);
    expect((arrived.body as DriverBookingView).status).toBe('driver_arrived');

    const otp = await customerOtp(ctx, trip);
    const noPhotos = await driverPost(trip, 'start', { otp }).expect(409);
    expect(noPhotos.body.message).toBe('Take all vehicle photos before starting the trip');
    expect([...noPhotos.body.missingSides].sort()).toEqual(SORTED_REQUIRED_SIDES);

    const slots = await driverPost(trip, 'photo-uploads', {
      phase: 'pre_trip',
      sides: ['front'],
    }).expect(200);
    const [slot] = slots.body as PhotoUploadSlot[];
    expect(slot?.side).toBe('front');
    expect(slot?.key.startsWith(`trips/${trip.booking.id}/pre_trip/front-`)).toBe(true);
    expect(slot?.uploadUrl).toContain('X-Amz-Signature');

    await uploadTripPhotos(ctx, trip.driverToken, trip.booking.id, 'pre_trip');

    const wrong = await driverPost(trip, 'start', { otp: wrongOtp(otp) }).expect(400);
    expect(wrong.body.message).toBe('That code is incorrect. Ask the customer to check their app.');

    const started = await driverPost(trip, 'start', { otp }).expect(200);
    const startedView = started.body as DriverBookingView;
    expect(startedView.status).toBe('in_progress');
    expect([...startedView.photos.preTrip].sort()).toEqual(SORTED_REQUIRED_SIDES);

    const location = nextEvent<DriverLocationEvent>(
      customerSocket,
      'driver.location',
      (event) => event.bookingId === trip.booking.id,
    );
    await sendPoints(trip, [ONE_KM_NORTH]);
    expect(await location).toMatchObject({
      bookingId: trip.booking.id,
      lat: ONE_KM_NORTH.lat,
      lng: ONE_KM_NORTH.lng,
    });

    const noPostPhotos = await driverPost(trip, 'end').expect(409);
    expect(noPostPhotos.body.message).toBe('Take all vehicle photos before ending the trip');
    expect([...noPostPhotos.body.missingSides].sort()).toEqual(SORTED_REQUIRED_SIDES);

    const ended = await endTrip(trip);
    expect(ended.status).toBe('completed');
    expect(ended.paymentStatus).toBe('unpaid');
    expect(ended.final?.farePaise).toBeGreaterThan(0);

    const customerView = await customerBooking(trip);
    expect(customerView.status).toBe('completed');
    expect(customerView.otpCode).toBeNull();
    expect(customerView.final?.farePaise).toBe(ended.final?.farePaise);
  });

  it('rejects pre-trip photos before arrival and post-trip photos before the trip starts', async () => {
    const trip = await bookAndAssign(ctx);
    const early = await driverPost(trip, 'photo-uploads', {
      phase: 'pre_trip',
      sides: ['front'],
    }).expect(409);
    expect(early.body.message).toBe('Pre-trip photos are taken at pickup');

    await driverPost(trip, 'arrived').expect(200);
    const post = await driverPost(trip, 'photo-uploads', {
      phase: 'post_trip',
      sides: ['front'],
    }).expect(409);
    expect(post.body.message).toBe('Post-trip photos are taken at drop-off');
  });

  it('rejects photo keys that belong to another booking or phase', async () => {
    const trip = await bookAndAssign(ctx);
    await driverPost(trip, 'arrived').expect(200);
    const takenAt = new Date().toISOString();

    const foreign = await driverPost(trip, 'photos', {
      phase: 'pre_trip',
      photos: [{ side: 'front', key: `trips/${randomUUID()}/pre_trip/front-x.jpg`, takenAt }],
    }).expect(400);
    expect(foreign.body.message).toBe('This photo does not belong to this trip');

    await driverPost(trip, 'photos', {
      phase: 'pre_trip',
      photos: [{ side: 'front', key: `trips/${trip.booking.id}/post_trip/front-x.jpg`, takenAt }],
    }).expect(400);
  });

  it('locks the trip OTP after 5 wrong codes', async () => {
    const trip = await bookAndAssign(ctx);
    await driverPost(trip, 'arrived').expect(200);
    await uploadTripPhotos(ctx, trip.driverToken, trip.booking.id, 'pre_trip');
    const otp = await customerOtp(ctx, trip);

    for (let attempt = 1; attempt <= 5; attempt++) {
      await driverPost(trip, 'start', { otp: wrongOtp(otp) }).expect(400);
    }
    const sixth = await driverPost(trip, 'start', { otp: wrongOtp(otp) }).expect(429);
    expect(sixth.body.message).toBe('Too many wrong codes. Call the customer or Kaarx support.');
    await driverPost(trip, 'start', { otp }).expect(429);
  });

  it("hides another driver's trip", async () => {
    const trip = await bookAndAssign(ctx);
    const other = await insertApprovedDriver(ctx);
    const otherToken = await loginDriver(ctx, other);

    const res = await api(ctx)
      .post(`/driver/bookings/${trip.booking.id}/arrived`)
      .set(bearer(otherToken))
      .expect(404);
    expect(res.body.message).toBe('Trip not found');
  });

  it('keeps the trip as current until cash is collected, then returns null', async () => {
    const trip = await bookAndAssign(ctx);
    expect((await currentTrip(trip)).body.booking.id).toBe(trip.booking.id);

    const notYet = await driverPost(trip, 'cash-collected').expect(409);
    expect(notYet.body.message).toBe('This trip is not waiting for payment');

    await startTrip(ctx, trip);
    expect((await currentTrip(trip)).body.booking.status).toBe('in_progress');

    await endTrip(trip);
    expect((await currentTrip(trip)).body.booking).toMatchObject({
      id: trip.booking.id,
      status: 'completed',
      paymentStatus: 'unpaid',
    });

    const paid = await driverPost(trip, 'cash-collected').expect(200);
    expect((paid.body as DriverBookingView).paymentStatus).toBe('paid');

    const again = await driverPost(trip, 'cash-collected').expect(409);
    expect(again.body.message).toBe('This trip is not waiting for payment');

    expect((await currentTrip(trip)).body.booking).toBeNull();
    expect((await customerBooking(trip)).payment).toEqual({ method: 'cash', status: 'paid' });
  });
});

describe('final fare (Review Focus #1)', () => {
  it('uses a plausible GPS trace: ~1 km on the seed rule hits the minimum fare (23000)', async () => {
    const trip = await bookAndAssign(ctx);
    await startTrip(ctx, trip);
    await sendPoints(trip, [PLACES.jubileeHills, ONE_KM_NORTH]);

    const ended = await endTrip(trip);
    expect(ended.final?.breakdown.distanceKm).toBe(1);
    expect(ended.final?.breakdown.minFareTopUpPaise).toBe(3800);
    expect(ended.final?.farePaise).toBe(23000);

    const event = await fareComputed(trip.booking.id);
    expect(event?.usedTrace).toBe(true);
    expect(event?.tracePoints).toBe(2);
  });

  it('falls back to the estimate when the trace has fewer than 2 points', async () => {
    const trip = await bookAndAssign(ctx);
    await startTrip(ctx, trip);
    await sendPoints(trip, [ONE_KM_NORTH]);

    const ended = await endTrip(trip);
    expect(ended.final?.farePaise).toBe(trip.booking.estimate.farePaise);
    const event = await fareComputed(trip.booking.id);
    expect(event?.usedTrace).toBe(false);
    expect(event?.tracePoints).toBe(1);
  });

  it('falls back to the estimate when the trace is longer than 1.5x the estimate', async () => {
    const trip = await bookAndAssign(ctx);
    await startTrip(ctx, trip);
    await sendPoints(trip, [PLACES.jubileeHills, PLACES.vijayawada]);

    const ended = await endTrip(trip);
    expect(ended.final?.farePaise).toBe(trip.booking.estimate.farePaise);

    const event = await fareComputed(trip.booking.id);
    expect(event?.usedTrace).toBe(false);
    expect(Number(event?.tracedDistanceM)).toBeGreaterThan(1.5 * Number(event?.estimatedDistanceM));
  });
});
