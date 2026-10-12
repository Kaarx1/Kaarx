import { describe, expect, it } from 'vitest';
import { normalizeRegistrationNumber } from '../src/registration';

describe('normalizeRegistrationNumber', () => {
  it.each([
    ['TS 09 AB 1234', 'TS09AB1234'],
    ['ts-09-ab-1234', 'TS09AB1234'],
    ['KA01A1234', 'KA01A1234'],
    ['DL 1 CAB 1234', 'DL1CAB1234'],
    ['MH12 1234', 'MH121234'],
    ['22 BH 1234 AA', '22BH1234AA'],
    ['22bh1234a', '22BH1234A'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeRegistrationNumber(input)).toBe(expected);
  });

  it.each(['TS09AB123', '1234', 'TS09ABCD1234', '22BH1234', 'T09AB1234', ''])(
    'rejects %j',
    (input) => {
      expect(normalizeRegistrationNumber(input)).toBeNull();
    },
  );
});
