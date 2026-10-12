import type { Socket } from 'socket.io-client';
import type { CustomerBookingView, DriverBookingView, OfferView } from '@kaarx/shared';
import { api, bearer, createTestApp, resetState, type TestContext } from './helpers/test-app';
import {
  addVehicle,
  bookAndAssign,
  createBooking,
  loginReadyCustomer,
  onlineDriver,
  setOfferTimeout,
  startTrip,
  type AssignedTrip,
} from './helpers/factories';
import { collectEvents, connectSocket, nextEvent } from './helpers/sockets';

jest.setTimeout(30_000);

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function customerCancel(token: string, bookingId: string) {
  return api(ctx)
    .post(`/customer/bookings/${bookingId}/cancel`)
    .set(bearer(token))
    .send({ reason: 'Changed my plans' });
}

function driverCancel(trip: AssignedTrip, body: object) {
  return api(ctx)
    .post(`/driver/bookings/${trip.booking.id}/cancel`)
    .set(bearer(trip.driverToken))
    .send(body);
}

async function customerBooking(trip: AssignedTrip): Promise<CustomerBookingView> {
  const res = await api(ctx)
    .get(`/customer/bookings/${trip.booking.id}`)
    .set(bearer(trip.customer.token))
    .expect(200);
  return res.body as CustomerBookingView;
}

describe('customer cancel', () => {
  it('while searching: no fee and the offered driver gets offer.withdrawn', async () => {
    await setOfferTimeout(ctx, 30);
    const customer = await loginReadyCustomer(ctx);
    const vehicle = await addVehicle(ctx, customer.token);
    const { token: driverToken } = await onlineDriver(ctx);
    const driverSocket = await socketFor(driverToken);

    const offered = nextEvent<OfferView>(driverSocket, 'offer.new');
    const booking = await createBooking(ctx, customer.token, vehicle.id);
    const offer = await offered;
    expect(offer.bookingId).toBe(booking.id);

    const withdrawn = nextEvent<{ offerId: string; bookingId: string }>(
      driverSocket,
      'offer.withdrawn',
      (event) => event.bookingId === booking.id,
    );
    const res = await customerCancel(customer.token, booking.id).expect(200);
    const view = res.body as CustomerBookingView;
    expect(view.status).toBe('cancelled');
    expect(view.cancellation).toEqual({ by: 'customer', reason: 'Changed my plans', feePaise: 0 });
    expect((await withdrawn).offerId).toBe(offer.offerId);
  });

  it('within the grace period after assignment: no fee', async () => {
    const trip = await bookAndAssign(ctx);
    const res = await customerCancel(trip.customer.token, trip.booking.id).expect(200);
    expect((res.body as CustomerBookingView).cancellation?.feePaise).toBe(0);
  });

  it('after the grace period: fee 5000 and the driver gets booking.updated cancelled', async () => {
    await ctx.ds.query(`update pricing_rules set cancellation_grace_sec = 0`);
    const trip = await bookAndAssign(ctx);
    const driverSocket = await socketFor(trip.driverToken);
    await sleep(1100);

    const driverUpdate = nextEvent<DriverBookingView>(
      driverSocket,
      'booking.updated',
      (view) => view.id === trip.booking.id && view.status === 'cancelled',
    );
    const res = await customerCancel(trip.customer.token, trip.booking.id).expect(200);
    expect((res.body as CustomerBookingView).cancellation).toEqual({
      by: 'customer',
      reason: 'Changed my plans',
      feePaise: 5000,
    });
    expect((await driverUpdate).status).toBe('cancelled');
  });

  it('cannot cancel a trip in progress', async () => {
    const trip = await bookAndAssign(ctx);
    await startTrip(ctx, trip);
    const res = await customerCancel(trip.customer.token, trip.booking.id).expect(409);
    expect(res.body.message).toBe('This booking can no longer be cancelled');
  });

  it("cannot cancel someone else's booking", async () => {
    const trip = await bookAndAssign(ctx);
    const other = await loginReadyCustomer(ctx);
    await customerCancel(other.token, trip.booking.id).expect(404);
  });
});

describe('driver cancel', () => {
  it('releasing an assigned trip re-dispatches it to another driver, never back to the first', async () => {
    // Round 1 is queued with no delay on release; a 10 s timeout keeps round 2 out of this test.
    const trip = await bookAndAssign(ctx, { offerTimeoutSec: 10 });
    const firstSocket = await socketFor(trip.driverToken);
    const customerSocket = await socketFor(trip.customer.token);
    const second = await onlineDriver(ctx);
    const secondSocket = await socketFor(second.token);

    const firstOffers = collectEvents<OfferView>(firstSocket, 'offer.new');
    const secondOffer = nextEvent<OfferView>(
      secondSocket,
      'offer.new',
      (o) => o.bookingId === trip.booking.id,
    );
    const searchingAgain = nextEvent<CustomerBookingView>(
      customerSocket,
      'booking.updated',
      (view) => view.id === trip.booking.id && view.status === 'searching',
    );

    const res = await driverCancel(trip, { reason: 'personal_emergency' }).expect(200);
    expect(res.body).toEqual({ status: 'searching' });

    expect((await searchingAgain).driver).toBeNull();
    expect((await secondOffer).bookingId).toBe(trip.booking.id);

    await sleep(1500);
    firstOffers.stop();
    expect(firstOffers.events.filter((o) => o.bookingId === trip.booking.id)).toHaveLength(0);

    const view = await customerBooking(trip);
    expect(view.status).not.toBe('assigned');
    expect(view.driver).toBeNull();
  });

  it('cancelling at pickup (customer_no_show) cancels the booking by the driver', async () => {
    const trip = await bookAndAssign(ctx);
    await api(ctx)
      .post(`/driver/bookings/${trip.booking.id}/arrived`)
      .set(bearer(trip.driverToken))
      .expect(200);

    const res = await driverCancel(trip, {
      reason: 'customer_no_show',
      notes: 'Waited 15 minutes at pickup',
    }).expect(200);
    expect(res.body).toEqual({ status: 'cancelled' });

    const view = await customerBooking(trip);
    expect(view.status).toBe('cancelled');
    expect(view.cancellation?.by).toBe('driver');
    expect(view.cancellation?.reason).toBe('customer_no_show: Waited 15 minutes at pickup');
  });

  it('cannot cancel a trip in progress', async () => {
    const trip = await bookAndAssign(ctx);
    await startTrip(ctx, trip);
    const res = await driverCancel(trip, { reason: 'other' }).expect(409);
    expect(res.body.message).toBe('This trip can no longer be cancelled');
  });
});
