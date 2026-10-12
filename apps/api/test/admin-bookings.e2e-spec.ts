import { randomUUID } from 'node:crypto';
import type { AdminBookingDetail, AdminBookingRow } from '@kaarx/shared';
import { api, bearer, createTestApp, resetState, type TestContext } from './helpers/test-app';
import { bookAndAssign, loginAdmin, uploadTripPhotos } from './helpers/factories';

jest.setTimeout(30_000);

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetState(ctx);
});

async function search(token: string, query: Record<string, string>): Promise<AdminBookingRow[]> {
  const res = await api(ctx).get('/admin/bookings').query(query).set(bearer(token)).expect(200);
  return res.body as AdminBookingRow[];
}

describe('admin bookings', () => {
  it('finds a booking by code, vehicle number, customer phone and status', async () => {
    const trip = await bookAndAssign(ctx);
    const { token } = await loginAdmin(ctx, 'support_agent');

    const byCode = await search(token, { q: trip.booking.code });
    expect(byCode.map((row) => row.id)).toEqual([trip.booking.id]);
    expect(byCode[0]).toMatchObject({
      code: trip.booking.code,
      status: 'assigned',
      driverName: trip.driver.fullName,
      vehicleNumber: trip.vehicle.registrationNumber,
    });

    const spacedNumber = trip.vehicle.registrationNumber
      .toLowerCase()
      .replace(/^(..)(..)/, '$1 $2 ');
    expect((await search(token, { q: spacedNumber })).map((row) => row.id)).toEqual([
      trip.booking.id,
    ]);

    const phoneDigits = trip.customer.phone.replace(/\D/g, '').slice(-10);
    expect((await search(token, { q: phoneDigits })).map((row) => row.id)).toEqual([
      trip.booking.id,
    ]);

    expect((await search(token, { status: 'assigned' })).map((row) => row.id)).toContain(
      trip.booking.id,
    );
    expect(await search(token, { status: 'completed' })).toEqual([]);
    expect(await search(token, { q: 'KX-1' })).toEqual([]);
  });

  it('shows events, offers and presigned photo links in the detail', async () => {
    const trip = await bookAndAssign(ctx);
    await api(ctx)
      .post(`/driver/bookings/${trip.booking.id}/arrived`)
      .set(bearer(trip.driverToken))
      .expect(200);
    await uploadTripPhotos(ctx, trip.driverToken, trip.booking.id, 'pre_trip');
    const { token } = await loginAdmin(ctx, 'read_only');

    const res = await api(ctx)
      .get(`/admin/bookings/${trip.booking.id}`)
      .set(bearer(token))
      .expect(200);
    const detail = res.body as AdminBookingDetail;

    expect(detail.booking.id).toBe(trip.booking.id);
    expect(detail.customer.id).toBe(trip.customer.id);
    expect(detail.driverPhone).toBe(trip.driver.phone);

    const eventTypes = detail.events.map((event) => event.eventType);
    expect(eventTypes).toEqual(
      expect.arrayContaining(['booking.created', 'offer.accepted', 'trip.arrived']),
    );

    expect(detail.offers).toHaveLength(1);
    expect(detail.offers[0]).toMatchObject({
      driverId: trip.driver.id,
      driverName: trip.driver.fullName,
      round: 1,
      response: 'accepted',
    });

    expect(detail.photos).toHaveLength(5);
    expect(detail.photos.every((photo) => photo.phase === 'pre_trip')).toBe(true);
    expect(detail.photos[0]?.url).toContain('X-Amz-Signature');
  });

  it('404s an unknown booking', async () => {
    const { token } = await loginAdmin(ctx, 'read_only');
    const res = await api(ctx)
      .get(`/admin/bookings/${randomUUID()}`)
      .set(bearer(token))
      .expect(404);
    expect(res.body.message).toBe('Booking not found');
  });
});
