import { REALTIME_EVENTS, type DriverLocationEvent, type OnlineDriverView } from '@kaarx/shared';
import {
  addVehicle,
  HYDERABAD_CITY_ID,
  insertApprovedDriver,
  loginAdmin,
  loginDriver,
  loginReadyCustomer,
  onlineDriver,
  PLACES,
} from './helpers/factories';
import { closeAllSockets, connectSocket, nextEvent } from './helpers/sockets';
import { api, bearer, createTestApp, resetState, type TestContext } from './helpers/test-app';

const latLng = (p: { lat: number; lng: number }) => ({ lat: p.lat, lng: p.lng });

describe('driver presence', () => {
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

  async function liveDrivers(): Promise<OnlineDriverView[]> {
    const admin = await loginAdmin(ctx);
    const res = await api(ctx).get('/admin/live/drivers').set(bearer(admin.token)).expect(200);
    return res.body as OnlineDriverView[];
  }

  async function locationRows(driverId: string): Promise<{ bookingId: string | null }[]> {
    return (await ctx.ds.query(
      'select booking_id as "bookingId" from driver_locations where driver_id = $1 order by recorded_at',
      [driverId],
    )) as { bookingId: string | null }[];
  }

  async function insertAssignedBooking(
    customerId: string,
    vehicleId: string,
    driverId: string,
  ): Promise<string> {
    const rows = (await ctx.ds.query(
      `insert into bookings (customer_id, vehicle_id, vehicle_snapshot, city_id, status, pickup_address, pickup_location,
                             dropoff_address, dropoff_location, pricing_rule_id, estimated_fare_paise, otp_code,
                             driver_id, assigned_at)
       values ($1, $2, '{}'::jsonb, $3, 'assigned', 'Jubilee Hills',
               ST_SetSRID(ST_MakePoint(78.4071, 17.4325), 4326)::geography, 'Airport',
               ST_SetSRID(ST_MakePoint(78.4294, 17.2403), 4326)::geography,
               (select id from pricing_rules where city_id = $3 and body_type is null order by effective_from desc limit 1),
               35000, '1234', $4, now())
       returning id`,
      [customerId, vehicleId, HYDERABAD_CITY_ID, driverId],
    )) as { id: string }[];
    const row = rows[0];
    if (!row) throw new Error('booking insert returned no row');
    return row.id;
  }

  it('refuses a driver who is not approved', async () => {
    const driver = await insertApprovedDriver(ctx, { verificationStatus: 'pending' });
    const token = await loginDriver(ctx, driver);
    await api(ctx)
      .post('/driver/online')
      .set(bearer(token))
      .send(latLng(PLACES.nearJubilee))
      .expect(403);
  });

  it('refuses a position outside the service area', async () => {
    const driver = await insertApprovedDriver(ctx);
    const token = await loginDriver(ctx, driver);
    const res = await api(ctx)
      .post('/driver/online')
      .set(bearer(token))
      .send(latLng(PLACES.outsideZone))
      .expect(422);
    expect(res.body.message).toBe('You are outside the Kaarx service area');
  });

  it('goes online, opens one session and shows up in the admin live list', async () => {
    const driver = await insertApprovedDriver(ctx);
    const token = await loginDriver(ctx, driver);
    const res = await api(ctx)
      .post('/driver/online')
      .set(bearer(token))
      .send(latLng(PLACES.nearJubilee))
      .expect(200);
    expect(res.body).toEqual({ online: true, zoneId: expect.any(String) });
    await api(ctx)
      .post('/driver/online')
      .set(bearer(token))
      .send(latLng(PLACES.nearJubilee))
      .expect(200);

    const sessions = (await ctx.ds.query(
      'select count(*)::int as "open" from driver_sessions where driver_id = $1 and went_offline_at is null',
      [driver.id],
    )) as { open: number }[];
    expect(sessions[0]?.open).toBe(1);

    const row = (await liveDrivers()).find((d) => d.driverId === driver.id);
    expect(row).toMatchObject({
      driverId: driver.id,
      code: driver.code,
      fullName: driver.fullName,
      phone: driver.phone,
    });
    expect(row?.lat).toBeCloseTo(PLACES.nearJubilee.lat, 4);
    expect(row?.lng).toBeCloseTo(PLACES.nearJubilee.lng, 4);
  });

  it('stores a location batch and moves the driver to the latest point', async () => {
    const { driver, token } = await onlineDriver(ctx);
    const now = Date.now();
    const res = await api(ctx)
      .post('/driver/locations')
      .set(bearer(token))
      .send({
        points: [
          { ...latLng(PLACES.jubileeHills), recordedAt: new Date(now).toISOString(), heading: 90 },
          {
            ...latLng(PLACES.nearJubilee),
            recordedAt: new Date(now - 5000).toISOString(),
            speedMps: 4,
          },
        ],
      })
      .expect(202);
    expect(res.body).toEqual({ accepted: 2 });
    expect(await locationRows(driver.id)).toEqual([{ bookingId: null }, { bookingId: null }]);

    const row = (await liveDrivers()).find((d) => d.driverId === driver.id);
    expect(row?.lat).toBeCloseTo(PLACES.jubileeHills.lat, 4);
  });

  it('going offline clears presence, closes the session and ignores later locations', async () => {
    const { driver, token } = await onlineDriver(ctx);
    await api(ctx).post('/driver/offline').set(bearer(token)).expect(204);

    expect((await liveDrivers()).some((d) => d.driverId === driver.id)).toBe(false);
    const sessions = (await ctx.ds.query(
      'select went_offline_at as "wentOfflineAt" from driver_sessions where driver_id = $1',
      [driver.id],
    )) as { wentOfflineAt: Date | null }[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.wentOfflineAt).not.toBeNull();

    const res = await api(ctx)
      .post('/driver/locations')
      .set(bearer(token))
      .send({ points: [{ ...latLng(PLACES.nearJubilee), recordedAt: new Date().toISOString() }] })
      .expect(202);
    expect(res.body).toEqual({ accepted: 0 });
    expect(await locationRows(driver.id)).toHaveLength(0);
    expect((await liveDrivers()).some((d) => d.driverId === driver.id)).toBe(false);
  });

  it('with a live trip: forwards locations to the customer and refuses to go offline', async () => {
    const customer = await loginReadyCustomer(ctx);
    const vehicle = await addVehicle(ctx, customer.token);
    const { driver, token } = await onlineDriver(ctx);
    const bookingId = await insertAssignedBooking(customer.id, vehicle.id, driver.id);
    const customerSocket = await connectSocket(ctx, customer.token);

    const located = nextEvent<DriverLocationEvent>(customerSocket, REALTIME_EVENTS.driverLocation);
    const recordedAt = new Date().toISOString();
    await api(ctx)
      .post('/driver/locations')
      .set(bearer(token))
      .send({ points: [{ ...latLng(PLACES.jubileeHills), recordedAt, heading: 45 }] })
      .expect(202);
    expect(await located).toEqual({
      bookingId,
      lat: PLACES.jubileeHills.lat,
      lng: PLACES.jubileeHills.lng,
      heading: 45,
      recordedAt,
    });
    expect(await locationRows(driver.id)).toEqual([{ bookingId }]);

    const res = await api(ctx).post('/driver/offline').set(bearer(token)).expect(409);
    expect(res.body.message).toBe('Finish your current trip before going offline');
  });
});
