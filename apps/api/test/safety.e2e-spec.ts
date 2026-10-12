import type { Socket } from 'socket.io-client';
import type { SosAdminView } from '@kaarx/shared';
import { api, bearer, createTestApp, resetState, type TestContext } from './helpers/test-app';
import { bookAndAssign, loginAdmin, loginReadyCustomer, PLACES } from './helpers/factories';
import { connectSocket, nextEvent } from './helpers/sockets';

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

describe('SOS', () => {
  it("a customer's SOS on their own trip reaches the admin socket with the booking code", async () => {
    const trip = await bookAndAssign(ctx);
    const { token: adminToken } = await loginAdmin(ctx, 'ops_manager');
    const adminSocket = await connectSocket(ctx, adminToken);
    sockets.push(adminSocket);

    const raised = nextEvent<SosAdminView>(adminSocket, 'sos.raised');
    const res = await api(ctx)
      .post('/sos')
      .set(bearer(trip.customer.token))
      .send({
        bookingId: trip.booking.id,
        lat: PLACES.jubileeHills.lat,
        lng: PLACES.jubileeHills.lng,
      })
      .expect(201);

    const view = await raised;
    expect(view).toMatchObject({
      id: res.body.id,
      status: 'open',
      raisedBy: { type: 'customer', id: trip.customer.id },
      booking: { id: trip.booking.id, code: trip.booking.code, status: 'assigned' },
    });
    expect(view.location?.lat).toBeCloseTo(PLACES.jubileeHills.lat, 6);
    expect(view.location?.lng).toBeCloseTo(PLACES.jubileeHills.lng, 6);

    const events: { event_type: string }[] = await ctx.ds.query(
      `select event_type from booking_events where booking_id = $1 and event_type = 'sos.raised'`,
      [trip.booking.id],
    );
    expect(events).toHaveLength(1);
  });

  it('a driver can raise SOS without a booking', async () => {
    const trip = await bookAndAssign(ctx);
    const res = await api(ctx).post('/sos').set(bearer(trip.driverToken)).send({}).expect(201);
    expect(typeof res.body.id).toBe('string');
  });

  it("SOS for someone else's booking is 404", async () => {
    const trip = await bookAndAssign(ctx);
    const stranger = await loginReadyCustomer(ctx);
    const res = await api(ctx)
      .post('/sos')
      .set(bearer(stranger.token))
      .send({ bookingId: trip.booking.id })
      .expect(404);
    expect(res.body.message).toBe('Booking not found');
  });

  it('an admin lists and handles an SOS once, with an audit entry', async () => {
    const trip = await bookAndAssign(ctx);
    const sos = await api(ctx)
      .post('/sos')
      .set(bearer(trip.driverToken))
      .send({ bookingId: trip.booking.id })
      .expect(201);
    const { token } = await loginAdmin(ctx, 'support_agent');

    const open = await api(ctx).get('/admin/sos').set(bearer(token)).expect(200);
    expect((open.body as SosAdminView[]).map((s) => s.id)).toContain(sos.body.id);

    const handled = await api(ctx)
      .post(`/admin/sos/${sos.body.id}/handle`)
      .set(bearer(token))
      .send({ notes: 'Called the driver, all safe' })
      .expect(200);
    expect(handled.body).toMatchObject({
      id: sos.body.id,
      status: 'handled',
      notes: 'Called the driver, all safe',
    });

    const again = await api(ctx)
      .post(`/admin/sos/${sos.body.id}/handle`)
      .set(bearer(token))
      .send({ notes: 'Second try' })
      .expect(409);
    expect(again.body.message).toBe('This SOS has already been handled');

    const audit: { action: string }[] = await ctx.ds.query(
      `select action from audit_logs where entity_id = $1`,
      [sos.body.id],
    );
    expect(audit).toEqual([{ action: 'sos.handle' }]);

    const after = await api(ctx).get('/admin/sos').set(bearer(token)).expect(200);
    expect((after.body as SosAdminView[]).map((s) => s.id)).not.toContain(sos.body.id);
  });

  it('a read_only admin cannot handle an SOS', async () => {
    const trip = await bookAndAssign(ctx);
    const sos = await api(ctx).post('/sos').set(bearer(trip.customer.token)).send({}).expect(201);
    const { token } = await loginAdmin(ctx, 'read_only');

    await api(ctx).get('/admin/sos').set(bearer(token)).expect(200);
    await api(ctx)
      .post(`/admin/sos/${sos.body.id}/handle`)
      .set(bearer(token))
      .send({ notes: 'Trying anyway' })
      .expect(403);
  });
});
