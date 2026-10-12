import {
  computeSettlement,
  REALTIME_EVENTS,
  type CustomerBookingView,
  type DriverBookingView,
  type OfferView,
} from '@kaarx/shared';
import { IsNull } from 'typeorm';
import { PricingRule } from '../src/database/entities';
import {
  addVehicle,
  createBooking,
  HYDERABAD_CITY_ID,
  loginReadyCustomer,
  onlineDriver,
  PLACES,
  setOfferTimeout,
} from './helpers/factories';
import { closeAllSockets, collectEvents, connectSocket, nextEvent } from './helpers/sockets';
import { api, bearer, createTestApp, resetState, type TestContext } from './helpers/test-app';

const NO_LONGER_AVAILABLE = 'This request is no longer available';

describe('booking creation and dispatch', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    closeAllSockets();
    await ctx.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
  });
  afterEach(() => closeAllSockets());

  async function readyCustomer(vehicleOverrides?: Parameters<typeof addVehicle>[2]) {
    const customer = await loginReadyCustomer(ctx);
    const vehicle = await addVehicle(ctx, customer.token, vehicleOverrides);
    return { customer, vehicle };
  }

  async function offerRounds(bookingId: string): Promise<number[]> {
    const rows = (await ctx.ds.query(
      'select round from booking_offers where booking_id = $1 order by round',
      [bookingId],
    )) as { round: number }[];
    return rows.map((r) => r.round);
  }

  it('creates a searching booking without the OTP and scopes it to its owner', async () => {
    const { customer, vehicle } = await readyCustomer();
    const booking = await createBooking(ctx, customer.token, vehicle.id);
    expect(booking).toMatchObject({
      status: 'searching',
      otpCode: null,
      driver: null,
      cancellation: null,
      final: null,
    });
    expect(booking.code).toMatch(/^KX-\d+$/);
    expect(booking.estimate.farePaise).toBe(booking.estimate.breakdown.totalPaise);
    expect(booking.payment).toEqual({ method: 'cash', status: 'unpaid' });

    const active = await api(ctx)
      .get('/customer/bookings?scope=active')
      .set(bearer(customer.token))
      .expect(200);
    expect((active.body as CustomerBookingView[]).map((b) => b.id)).toEqual([booking.id]);
    const past = await api(ctx)
      .get('/customer/bookings?scope=past')
      .set(bearer(customer.token))
      .expect(200);
    expect(past.body).toEqual([]);

    const other = await loginReadyCustomer(ctx);
    await api(ctx).get(`/customer/bookings/${booking.id}`).set(bearer(other.token)).expect(404);

    const outside = await readyCustomer();
    const res = await api(ctx)
      .post('/customer/bookings')
      .set(bearer(outside.customer.token))
      .send({
        pickup: PLACES.outsideZone,
        dropoff: PLACES.jubileeHills,
        vehicleId: outside.vehicle.id,
      })
      .expect(422);
    expect(res.body.message).toBe('Kaarx is not available at this pickup location yet');
  });

  it('offers a nearby driver and assigns on accept', async () => {
    await setOfferTimeout(ctx, 10);
    const { customer, vehicle } = await readyCustomer();
    const { driver, token: driverToken } = await onlineDriver(ctx);
    const driverSocket = await connectSocket(ctx, driverToken);
    const customerSocket = await connectSocket(ctx, customer.token);

    const offered = nextEvent<OfferView>(driverSocket, REALTIME_EVENTS.offerNew);
    const booking = await createBooking(ctx, customer.token, vehicle.id);
    const offer = await offered;

    const rule = await ctx.ds
      .getRepository(PricingRule)
      .findOneByOrFail({ cityId: HYDERABAD_CITY_ID, bodyType: IsNull() });
    expect(offer.bookingId).toBe(booking.id);
    expect(offer.estimate.earningPaise).toBe(
      computeSettlement(booking.estimate.farePaise, rule.platformCommissionPct).driverEarningPaise,
    );
    expect(offer.distanceToPickupM).toBeGreaterThan(0);
    expect(offer.pickup.address).toBe(PLACES.jubileeHills.address);

    const assigned = nextEvent<CustomerBookingView>(
      customerSocket,
      REALTIME_EVENTS.bookingUpdated,
      (b) => b.status === 'assigned',
    );
    const res = await api(ctx)
      .post(`/driver/offers/${offer.offerId}/accept`)
      .set(bearer(driverToken))
      .expect(200);
    const driverView = res.body as DriverBookingView;
    expect(driverView).toMatchObject({
      id: booking.id,
      status: 'assigned',
      paymentStatus: 'unpaid',
    });
    expect(driverView.photos).toEqual({ preTrip: [], postTrip: [] });
    expect(driverView).not.toHaveProperty('otpCode');

    const customerView = await assigned;
    expect(customerView.driver).toMatchObject({ id: driver.id, verified: true });
    expect(customerView.otpCode).toMatch(/^\d{4}$/);
    expect(customerView.assignedAt).not.toBeNull();
  });

  it('lets only one of two drivers accept', async () => {
    await setOfferTimeout(ctx, 10);
    const { customer, vehicle } = await readyCustomer();
    const first = await onlineDriver(ctx);
    const second = await onlineDriver(ctx, {}, PLACES.jubileeHills);
    const [socketA, socketB] = await Promise.all([
      connectSocket(ctx, first.token),
      connectSocket(ctx, second.token),
    ]);
    const offers = Promise.all([
      nextEvent<OfferView>(socketA, REALTIME_EVENTS.offerNew),
      nextEvent<OfferView>(socketB, REALTIME_EVENTS.offerNew),
    ]);
    await createBooking(ctx, customer.token, vehicle.id);
    const [offerA, offerB] = await offers;

    const results = await Promise.all([
      api(ctx).post(`/driver/offers/${offerA.offerId}/accept`).set(bearer(first.token)),
      api(ctx).post(`/driver/offers/${offerB.offerId}/accept`).set(bearer(second.token)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const loser = results.find((r) => r.status === 409);
    expect(loser?.body.message).toBe(NO_LONGER_AVAILABLE);
  });

  it('never offers an automatic car to a manual-only driver and ends with no_driver_found', async () => {
    const { customer, vehicle } = await readyCustomer({ transmission: 'automatic' });
    const { token: driverToken } = await onlineDriver(ctx, { transmission: 'manual' });
    const driverSocket = await connectSocket(ctx, driverToken);
    const customerSocket = await connectSocket(ctx, customer.token);
    const seenOffers = collectEvents<OfferView>(driverSocket, REALTIME_EVENTS.offerNew);

    const ended = nextEvent<CustomerBookingView>(
      customerSocket,
      REALTIME_EVENTS.bookingUpdated,
      (b) => b.status === 'no_driver_found',
      10_000,
    );
    const booking = await createBooking(ctx, customer.token, vehicle.id);
    const final = await ended;
    seenOffers.stop();

    expect(final.id).toBe(booking.id);
    expect(seenOffers.events).toHaveLength(0);
    expect(await offerRounds(booking.id)).toEqual([]);
  });

  it('reaches a driver 4 km away only in round 2', async () => {
    const { customer, vehicle } = await readyCustomer();
    const { token: driverToken } = await onlineDriver(ctx, {}, PLACES.fourKmNorth);
    const driverSocket = await connectSocket(ctx, driverToken);
    const offered = nextEvent<OfferView>(driverSocket, REALTIME_EVENTS.offerNew);
    const booking = await createBooking(ctx, customer.token, vehicle.id);
    const offer = await offered;
    expect(offer.bookingId).toBe(booking.id);
    expect(await offerRounds(booking.id)).toEqual([2]);
  });

  it('promotes the next round as soon as every offer in the round is declined', async () => {
    await setOfferTimeout(ctx, 10);
    const { customer, vehicle } = await readyCustomer();
    const near = await onlineDriver(ctx);
    const far = await onlineDriver(ctx, {}, PLACES.fourKmNorth);
    const [nearSocket, farSocket] = await Promise.all([
      connectSocket(ctx, near.token),
      connectSocket(ctx, far.token),
    ]);

    const firstOffer = nextEvent<OfferView>(nearSocket, REALTIME_EVENTS.offerNew);
    const booking = await createBooking(ctx, customer.token, vehicle.id);
    const offer = await firstOffer;

    const secondOffer = nextEvent<OfferView>(farSocket, REALTIME_EVENTS.offerNew, () => true, 3000);
    await api(ctx)
      .post(`/driver/offers/${offer.offerId}/decline`)
      .set(bearer(near.token))
      .send({ reason: 'Too far' })
      .expect(204);
    expect((await secondOffer).bookingId).toBe(booking.id);
    expect(await offerRounds(booking.id)).toEqual([1, 2]);
  });

  it('rejects accepting an offer whose time has run out', async () => {
    await setOfferTimeout(ctx, 10);
    const { customer, vehicle } = await readyCustomer();
    const { token: driverToken } = await onlineDriver(ctx);
    const driverSocket = await connectSocket(ctx, driverToken);
    const offered = nextEvent<OfferView>(driverSocket, REALTIME_EVENTS.offerNew);
    const booking = await createBooking(ctx, customer.token, vehicle.id);
    const offer = await offered;

    await ctx.ds.query(
      `update booking_offers set expires_at = now() - interval '1 second' where id = $1`,
      [offer.offerId],
    );
    const res = await api(ctx)
      .post(`/driver/offers/${offer.offerId}/accept`)
      .set(bearer(driverToken))
      .expect(409);
    expect(res.body.message).toBe(NO_LONGER_AVAILABLE);

    const view = await api(ctx)
      .get(`/customer/bookings/${booking.id}`)
      .set(bearer(customer.token))
      .expect(200);
    expect((view.body as CustomerBookingView).status).toBe('searching');
  });

  it('allows only one live booking per customer under concurrent requests', async () => {
    const { customer, vehicle } = await readyCustomer();
    const body = { pickup: PLACES.jubileeHills, dropoff: PLACES.airport, vehicleId: vehicle.id };
    const results = await Promise.all([
      api(ctx).post('/customer/bookings').set(bearer(customer.token)).send(body),
      api(ctx).post('/customer/bookings').set(bearer(customer.token)).send(body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)?.body.message).toBe(
      'You already have a booking in progress',
    );
  });

  it('lists the pending offer for the driver', async () => {
    await setOfferTimeout(ctx, 10);
    const { customer, vehicle } = await readyCustomer();
    const { token: driverToken } = await onlineDriver(ctx);
    const driverSocket = await connectSocket(ctx, driverToken);
    const offered = nextEvent<OfferView>(driverSocket, REALTIME_EVENTS.offerNew);
    await createBooking(ctx, customer.token, vehicle.id);
    const offer = await offered;

    const res = await api(ctx).get('/driver/offers').set(bearer(driverToken)).expect(200);
    expect(res.body).toEqual([offer]);
  });
});
