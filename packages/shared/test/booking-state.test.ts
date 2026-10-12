import { describe, expect, it } from 'vitest';
import {
  InvalidTransitionError,
  assertTransition,
  canTransition,
  isLiveStatus,
} from '../src/booking-state';
import { BOOKING_STATUSES, type BookingStatus } from '../src/enums';

const ALLOWED: ReadonlyArray<[BookingStatus, BookingStatus]> = [
  ['searching', 'assigned'],
  ['searching', 'cancelled'],
  ['searching', 'no_driver_found'],
  ['assigned', 'driver_arrived'],
  ['assigned', 'cancelled'],
  ['assigned', 'searching'],
  ['driver_arrived', 'in_progress'],
  ['driver_arrived', 'cancelled'],
  ['in_progress', 'completed'],
];

describe('booking state machine', () => {
  it('allows exactly the transitions in the spec', () => {
    for (const from of BOOKING_STATUSES) {
      for (const to of BOOKING_STATUSES) {
        const expected = ALLOWED.some(([f, t]) => f === from && t === to);
        expect({ from, to, allowed: canTransition(from, to) }).toEqual({
          from,
          to,
          allowed: expected,
        });
      }
    }
  });

  it('assertTransition passes for an allowed move', () => {
    expect(() => assertTransition('assigned', 'driver_arrived')).not.toThrow();
  });

  it('assertTransition throws InvalidTransitionError carrying both states', () => {
    let caught: unknown;
    try {
      assertTransition('in_progress', 'cancelled');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidTransitionError);
    expect(caught).toMatchObject({ from: 'in_progress', to: 'cancelled' });
  });

  it('terminal states allow nothing', () => {
    for (const terminal of ['completed', 'cancelled', 'no_driver_found'] as const) {
      for (const to of BOOKING_STATUSES) expect(canTransition(terminal, to)).toBe(false);
    }
  });

  it('isLiveStatus is true only for assigned, driver_arrived and in_progress', () => {
    const live = BOOKING_STATUSES.filter((status) => isLiveStatus(status));
    expect(live).toEqual(['assigned', 'driver_arrived', 'in_progress']);
  });
});
