import { describe, expect, it } from 'vitest';
import {
  computeCancellationFee,
  computeFare,
  computeSettlement,
  toRupee,
  type PricingRuleInput,
} from '../src/fare';

// Mirrors the pricing rule seeded by 0001_init.sql.
const SEED_RULE: PricingRuleInput = {
  baseFarePaise: 15000,
  includedKm: 0,
  perKmPaise: 1200,
  serviceFeePaise: 3000,
  platformCommissionPct: 17,
  freeWaitingMin: 5,
  waitingPerMinPaise: 200,
  minFarePaise: 20000,
};

describe('toRupee', () => {
  it('rounds paise to the nearest whole rupee', () => {
    expect(toRupee(17040)).toBe(17000);
    expect(toRupee(17050)).toBe(17100);
    expect(toRupee(0)).toBe(0);
  });
});

describe('computeFare', () => {
  it('matches the prototype: 14.2 km on the seed rule is Rs 350', () => {
    expect(computeFare(SEED_RULE, { distanceM: 14200, waitingS: 0 })).toEqual({
      baseFarePaise: 15000,
      distanceKm: 14.2,
      distanceChargePaise: 17000,
      waitingMin: 0,
      waitingChargePaise: 0,
      minFareTopUpPaise: 0,
      serviceFeePaise: 3000,
      totalPaise: 35000,
    });
  });

  it('rounds distance to one decimal km', () => {
    expect(computeFare(SEED_RULE, { distanceM: 14249, waitingS: 0 }).distanceKm).toBe(14.2);
    const fare = computeFare(SEED_RULE, { distanceM: 14250, waitingS: 0 });
    expect(fare.distanceKm).toBe(14.3);
    expect(fare.distanceChargePaise).toBe(17200);
  });

  it('charges waiting only after the free minutes, rounding minutes up', () => {
    const atFree = computeFare(SEED_RULE, { distanceM: 14200, waitingS: 300 });
    expect(atFree.waitingMin).toBe(5);
    expect(atFree.waitingChargePaise).toBe(0);
    const oneOver = computeFare(SEED_RULE, { distanceM: 14200, waitingS: 301 });
    expect(oneOver.waitingMin).toBe(6);
    expect(oneOver.waitingChargePaise).toBe(200);
    expect(oneOver.totalPaise).toBe(35200);
  });

  it('tops a short ride up to the minimum fare before the service fee', () => {
    expect(computeFare(SEED_RULE, { distanceM: 1000, waitingS: 0 })).toEqual({
      baseFarePaise: 15000,
      distanceKm: 1,
      distanceChargePaise: 1200,
      waitingMin: 0,
      waitingChargePaise: 0,
      minFareTopUpPaise: 3800,
      serviceFeePaise: 3000,
      totalPaise: 23000,
    });
  });

  it('subtracts included km before charging distance', () => {
    const rule = { ...SEED_RULE, includedKm: 2 };
    expect(computeFare(rule, { distanceM: 14200, waitingS: 0 }).distanceChargePaise).toBe(14600);
    expect(computeFare(rule, { distanceM: 1500, waitingS: 0 }).distanceChargePaise).toBe(0);
  });

  it('throws RangeError on negative distance or waiting', () => {
    expect(() => computeFare(SEED_RULE, { distanceM: -1, waitingS: 0 })).toThrow(RangeError);
    expect(() => computeFare(SEED_RULE, { distanceM: 0, waitingS: -1 })).toThrow(RangeError);
  });
});

describe('computeSettlement', () => {
  it('matches the prototype: 17% of Rs 350 is Rs 60, driver keeps Rs 290', () => {
    expect(computeSettlement(35000, 17)).toEqual({
      platformFeePaise: 6000,
      driverEarningPaise: 29000,
    });
  });

  it('rounds the platform fee to a whole rupee', () => {
    expect(computeSettlement(23000, 17)).toEqual({
      platformFeePaise: 3900,
      driverEarningPaise: 19100,
    });
  });
});

describe('computeCancellationFee', () => {
  const assignedAt = new Date('2026-10-08T10:00:00.000Z');
  const base = { assignedAt, graceSec: 120, feePaise: 5000 };

  it('is free while searching', () => {
    const now = new Date('2026-10-08T10:10:00.000Z');
    expect(computeCancellationFee({ ...base, status: 'searching', now })).toBe(0);
  });

  it('is free when no driver was ever assigned', () => {
    const now = new Date('2026-10-08T10:10:00.000Z');
    expect(computeCancellationFee({ ...base, assignedAt: null, status: 'assigned', now })).toBe(0);
  });

  it('is free up to and including the grace period', () => {
    const now = new Date('2026-10-08T10:02:00.000Z');
    expect(computeCancellationFee({ ...base, status: 'assigned', now })).toBe(0);
  });

  it('charges the fee once the grace period has passed', () => {
    const now = new Date('2026-10-08T10:02:01.000Z');
    expect(computeCancellationFee({ ...base, status: 'assigned', now })).toBe(5000);
    expect(computeCancellationFee({ ...base, status: 'driver_arrived', now })).toBe(5000);
  });
});
