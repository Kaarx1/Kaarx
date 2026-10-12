import { describe, expect, it } from 'vitest';
import { normalizeIndianMobile } from '../src/phone';

describe('normalizeIndianMobile', () => {
  it.each([
    '9876543210',
    '098765 43210',
    '+91 98765-43210',
    '+919876543210',
    '919876543210',
    ' 98765 43210 ',
    '(+91) 98765 43210',
  ])('normalizes %j to +919876543210', (input) => {
    expect(normalizeIndianMobile(input)).toBe('+919876543210');
  });

  it.each(['5876543210', '987654321', '98765432100', '+92 9876543210', 'abcdefghij', ''])(
    'rejects %j',
    (input) => {
      expect(normalizeIndianMobile(input)).toBeNull();
    },
  );
});
