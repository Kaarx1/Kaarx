import { computeFare, type VehicleSnapshot } from '@kaarx/shared';
import { IsNull } from 'typeorm';
import { isUniqueViolation } from '../src/common/db-errors';
import {
  Booking,
  Customer,
  DispatchSettings,
  PricingRule,
  SosEvent,
  Vehicle,
  fromGeoPoint,
  toGeoPoint,
} from '../src/database/entities';
import { HYDERABAD_CITY_ID, PLACES, insertApprovedDriver, uniquePhone } from './helpers/factories';
import { createTestApp, resetState, type TestContext } from './helpers/test-app';

describe('database (migration 0001 + entities)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetState(ctx);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('has PostGIS installed', async () => {
    const rows: { version: string }[] = await ctx.ds.query('select postgis_version() as version');
    expect(rows[0].version).toMatch(/^3\./);
  });

  it('seeds Hyderabad with an active zone covering Jubilee Hills', async () => {
    const cities: { name: string; is_active: boolean }[] = await ctx.ds.query(
      'select name, is_active from cities where id = $1',
      [HYDERABAD_CITY_ID],
    );
    expect(cities).toEqual([{ name: 'Hyderabad', is_active: true }]);
    const zones: { n: number }[] = await ctx.ds.query(
      `select count(*)::int as n from zones
        where city_id = $1 and is_active
          and ST_Covers(area, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography)`,
      [HYDERABAD_CITY_ID, PLACES.jubileeHills.lng, PLACES.jubileeHills.lat],
    );
    expect(zones[0].n).toBe(1);
  });

  it('round-trips a Driver: enum array, numeric, date and generated KD- code', async () => {
    const driver = await insertApprovedDriver(ctx, {
      bodyTypes: ['sedan', 'suv'],
      experienceYears: 4.5,
    });
    expect(driver.code).toMatch(/^KD-\d{4,}$/);
    expect(driver.bodyTypes).toEqual(['sedan', 'suv']);
    expect(driver.experienceYears).toBe(4.5);
    expect(driver.ratingAvg).toBe(0);
    expect(driver.maxPickupDistanceKm).toBe(5);
    expect(driver.dob).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(driver.languages).toEqual(['Telugu', 'Hindi', 'English']);
    expect(driver.verificationStatus).toBe('approved');
  });

  it('reports unique violations by constraint name', async () => {
    const first = await insertApprovedDriver(ctx);
    const error = await insertApprovedDriver(ctx, { phone: first.phone }).catch(
      (caught: unknown) => caught,
    );
    expect(isUniqueViolation(error, 'drivers_phone_key')).toBe(true);
    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation(error, 'some_other_constraint')).toBe(false);
    expect(isUniqueViolation(new Error('not a query error'))).toBe(false);
  });

  it('reads the seed PricingRule numerics as numbers', async () => {
    const rule = await ctx.ds
      .getRepository(PricingRule)
      .findOneByOrFail({ cityId: HYDERABAD_CITY_ID, bodyType: IsNull() });
    expect(rule.platformCommissionPct).toBe(17);
    expect(rule.includedKm).toBe(0);
    expect(rule.nightPct).toBe(0);
    expect(rule.baseFarePaise).toBe(15000);
    expect(rule.perKmPaise).toBe(1200);
    expect(rule.minFarePaise).toBe(20000);
    expect(rule.cancellationFeePaise).toBe(5000);
    expect(rule.cancellationGraceSec).toBe(120);
  });

  it('reads DispatchSettings numeric[] after resetState', async () => {
    const settings = await ctx.ds
      .getRepository(DispatchSettings)
      .findOneByOrFail({ cityId: HYDERABAD_CITY_ID });
    expect(settings.radiusStepsKm).toEqual([3, 5]);
    expect(settings.initialRadiusKm).toBe(3);
    expect(settings.offerTimeoutSec).toBe(1);
    expect(settings.maxRounds).toBe(2);
    expect(settings.maxSimultaneousOffers).toBe(5);
    expect(settings.reminderMinutes).toEqual([60, 15]);
  });

  it('round-trips a Booking: KX- code, geography points, jsonb and defaults', async () => {
    const customer = await ctx.ds
      .getRepository(Customer)
      .save({ phone: uniquePhone(), fullName: 'Asha Rao', ageConfirmedAt: new Date() });
    const vehicle = await ctx.ds.getRepository(Vehicle).save({
      customerId: customer.id,
      registrationNumber: 'TS09AB1234',
      brand: 'Maruti Suzuki',
      model: 'Swift',
      colour: 'White',
      bodyType: 'hatchback',
      fuel: 'petrol',
      transmission: 'manual',
      insuranceStatus: 'insured',
      insuranceValidTill: '2030-01-01',
      isDefault: true,
    });
    const rule = await ctx.ds
      .getRepository(PricingRule)
      .findOneByOrFail({ cityId: HYDERABAD_CITY_ID, bodyType: IsNull() });
    const breakdown = computeFare(rule, { distanceM: 5000, waitingS: 0 });
    const snapshot: VehicleSnapshot = {
      registrationNumber: vehicle.registrationNumber,
      brand: vehicle.brand,
      model: vehicle.model,
      colour: vehicle.colour,
      bodyType: vehicle.bodyType,
      fuel: vehicle.fuel,
      transmission: vehicle.transmission,
      insuranceStatus: vehicle.insuranceStatus,
      insuranceValidTill: vehicle.insuranceValidTill,
      notes: null,
    };
    const repo = ctx.ds.getRepository(Booking);
    const saved = await repo.save({
      customerId: customer.id,
      vehicleId: vehicle.id,
      vehicleSnapshot: snapshot,
      cityId: HYDERABAD_CITY_ID,
      pickupAddress: PLACES.jubileeHills.address,
      pickupLocation: toGeoPoint(PLACES.jubileeHills),
      dropoffAddress: PLACES.fourKmNorth.address,
      dropoffLocation: toGeoPoint(PLACES.fourKmNorth),
      pricingRuleId: rule.id,
      estimatedDistanceM: 5000,
      estimatedDurationS: 720,
      estimatedFarePaise: breakdown.totalPaise,
      estimatedBreakdown: breakdown,
      otpCode: '4821',
    });
    const booking = await repo.findOneByOrFail({ id: saved.id });
    expect(booking.code).toMatch(/^KX-\d+$/);
    expect(booking.status).toBe('searching');
    expect(booking.type).toBe('instant');
    expect(booking.dispatchRound).toBe(0);
    expect(booking.waitingS).toBe(0);
    expect(booking.paymentMethod).toBe('cash');
    expect(booking.paymentStatus).toBe('unpaid');
    expect(booking.cancellationFeePaise).toBe(0);
    expect(booking.otpCode).toBe('4821');
    expect(booking.driverId).toBeNull();
    expect(booking.finalBreakdown).toBeNull();
    expect(fromGeoPoint(booking.pickupLocation)).toEqual({ lat: 17.4325, lng: 78.4071 });
    expect(fromGeoPoint(booking.dropoffLocation)).toEqual({ lat: 17.4685, lng: 78.4071 });
    expect(booking.estimatedBreakdown).toEqual(breakdown);
    expect(booking.vehicleSnapshot).toEqual(snapshot);
  });

  it('round-trips a nullable geography column on SosEvent', async () => {
    const customer = await ctx.ds.getRepository(Customer).save({ phone: uniquePhone() });
    const repo = ctx.ds.getRepository(SosEvent);
    const saved = await repo.save({
      raisedByType: 'customer',
      raisedById: customer.id,
      location: toGeoPoint(PLACES.nearJubilee),
    });
    const sos = await repo.findOneByOrFail({ id: saved.id });
    expect(sos.status).toBe('open');
    expect(sos.location && fromGeoPoint(sos.location)).toEqual({ lat: 17.4301, lng: 78.4102 });
  });

  it('keeps audit_logs append-only', async () => {
    await ctx.ds.query(
      `insert into audit_logs (action, entity_type, entity_id) values ('test.created', 'driver', 'x')`,
    );
    await expect(ctx.ds.query(`update audit_logs set action = 'tampered'`)).rejects.toThrow(
      /append-only/,
    );
    await expect(ctx.ds.query('delete from audit_logs')).rejects.toThrow(/append-only/);
  });
});
