import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { computeFare, type FareEstimateView } from '@kaarx/shared';
import { IsNull } from 'typeorm';
import { PricingRule } from '../src/database/entities';
import { haversineMeters } from '../src/modules/geo/haversine';
import {
  HaversineRoutingProvider,
  OlaMapsRoutingProvider,
} from '../src/modules/geo/routing.provider';
import { toRuleInput } from '../src/modules/pricing/pricing.service';
import { addVehicle, HYDERABAD_CITY_ID, loginReadyCustomer, PLACES } from './helpers/factories';
import { api, bearer, createTestApp, resetState, type TestContext } from './helpers/test-app';

const latLng = (p: { lat: number; lng: number }) => ({ lat: p.lat, lng: p.lng });

describe('geo helpers', () => {
  afterEach(() => jest.restoreAllMocks());

  it('measures great-circle distance in metres', () => {
    expect(haversineMeters(PLACES.jubileeHills, PLACES.jubileeHills)).toBe(0);
    expect(haversineMeters({ lat: 17, lng: 78 }, { lat: 18, lng: 78 })).toBeCloseTo(111_195, -1);
  });

  it('haversine routing adds 30% road factor and drives at 25 km/h', async () => {
    const route = await new HaversineRoutingProvider().route(PLACES.jubileeHills, PLACES.airport);
    const expected = Math.round(haversineMeters(PLACES.jubileeHills, PLACES.airport) * 1.3);
    expect(route).toEqual({
      distanceM: expected,
      durationS: Math.round(expected / (25_000 / 3600)),
    });
  });

  it('Ola Maps provider sums the legs of the first route', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          routes: [
            {
              legs: [
                { distance: 1000, duration: 120 },
                { distance: 500.4, duration: 60 },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    await expect(
      new OlaMapsRoutingProvider('test-key').route(PLACES.jubileeHills, PLACES.airport),
    ).resolves.toEqual({
      distanceM: 1500,
      durationS: 180,
    });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get('origin')).toBe(
      `${PLACES.jubileeHills.lat},${PLACES.jubileeHills.lng}`,
    );
    expect(url.searchParams.get('destination')).toBe(`${PLACES.airport.lat},${PLACES.airport.lng}`);
    expect(url.searchParams.get('api_key')).toBe('test-key');
  });

  it('Ola Maps provider maps non-2xx to 503 and no legs to 422', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('down', { status: 500 }));
    await expect(
      new OlaMapsRoutingProvider('k').route(PLACES.jubileeHills, PLACES.airport),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ routes: [] }), { status: 200 }));
    await expect(
      new OlaMapsRoutingProvider('k').route(PLACES.jubileeHills, PLACES.airport),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

describe('POST /customer/fare-estimate', () => {
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

  it('prices Jubilee Hills → Airport with the seed rule and the haversine route', async () => {
    const customer = await loginReadyCustomer(ctx);
    const vehicle = await addVehicle(ctx, customer.token);

    const res = await api(ctx)
      .post('/customer/fare-estimate')
      .set(bearer(customer.token))
      .send({
        pickup: latLng(PLACES.jubileeHills),
        dropoff: latLng(PLACES.airport),
        vehicleId: vehicle.id,
      })
      .expect(200);

    const route = await new HaversineRoutingProvider().route(PLACES.jubileeHills, PLACES.airport);
    const rule = await ctx.ds
      .getRepository(PricingRule)
      .findOneByOrFail({ cityId: HYDERABAD_CITY_ID, bodyType: IsNull() });
    const expected: FareEstimateView = {
      distanceM: route.distanceM,
      durationS: route.durationS,
      breakdown: computeFare(toRuleInput(rule), { distanceM: route.distanceM, waitingS: 0 }),
    };
    expect(res.body).toEqual(expected);
  });

  it('rejects a pickup outside the service area with 422', async () => {
    const customer = await loginReadyCustomer(ctx);
    const vehicle = await addVehicle(ctx, customer.token);
    const res = await api(ctx)
      .post('/customer/fare-estimate')
      .set(bearer(customer.token))
      .send({
        pickup: latLng(PLACES.outsideZone),
        dropoff: latLng(PLACES.jubileeHills),
        vehicleId: vehicle.id,
      })
      .expect(422);
    expect(res.body.message).toBe('Kaarx is not available at this pickup location yet');
  });

  it('rejects a dropoff beyond the destination radius with 422', async () => {
    const customer = await loginReadyCustomer(ctx);
    const vehicle = await addVehicle(ctx, customer.token);
    const res = await api(ctx)
      .post('/customer/fare-estimate')
      .set(bearer(customer.token))
      .send({
        pickup: latLng(PLACES.jubileeHills),
        dropoff: latLng(PLACES.vijayawada),
        vehicleId: vehicle.id,
      })
      .expect(422);
    expect(res.body.message).toBe('This destination is too far for a Kaarx trip');
  });

  it("returns 404 for another customer's vehicle", async () => {
    const owner = await loginReadyCustomer(ctx);
    const vehicle = await addVehicle(ctx, owner.token);
    const other = await loginReadyCustomer(ctx);
    await api(ctx)
      .post('/customer/fare-estimate')
      .set(bearer(other.token))
      .send({
        pickup: latLng(PLACES.jubileeHills),
        dropoff: latLng(PLACES.airport),
        vehicleId: vehicle.id,
      })
      .expect(404);
  });

  it('prefers a body-type rule over the all-types rule', async () => {
    const rules = ctx.ds.getRepository(PricingRule);
    const suvRule = await rules.save(
      rules.create({
        cityId: HYDERABAD_CITY_ID,
        bodyType: 'suv',
        baseFarePaise: 25_000,
        perKmPaise: 1500,
        serviceFeePaise: 3000,
        platformCommissionPct: 17,
        minFarePaise: 30_000,
      }),
    );
    try {
      const customer = await loginReadyCustomer(ctx);
      const suv = await addVehicle(ctx, customer.token, { bodyType: 'suv' });
      const res = await api(ctx)
        .post('/customer/fare-estimate')
        .set(bearer(customer.token))
        .send({
          pickup: latLng(PLACES.jubileeHills),
          dropoff: latLng(PLACES.airport),
          vehicleId: suv.id,
        })
        .expect(200);
      const body = res.body as FareEstimateView;
      const fresh = await rules.findOneByOrFail({ id: suvRule.id });
      expect(body.breakdown).toEqual(
        computeFare(toRuleInput(fresh), { distanceM: body.distanceM, waitingS: 0 }),
      );
      expect(body.breakdown.baseFarePaise).toBe(25_000);
    } finally {
      await rules.delete(suvRule.id);
    }
  });
});
