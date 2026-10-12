import { describe, expect, it } from 'vitest';
import { ageInYears, daysBetween, todayIsoDateIST } from '../src/dates';

describe('todayIsoDateIST', () => {
  it('uses the Indian calendar day, not UTC', () => {
    expect(todayIsoDateIST(new Date('2026-10-08T18:29:59.000Z'))).toBe('2026-10-08');
    expect(todayIsoDateIST(new Date('2026-10-08T18:30:00.000Z'))).toBe('2026-10-09');
  });

  it('returns YYYY-MM-DD for now by default', () => {
    expect(todayIsoDateIST()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('ageInYears', () => {
  it('counts a birthday only once it has arrived', () => {
    expect(ageInYears('2005-10-09', '2026-10-08')).toBe(20);
    expect(ageInYears('2005-10-08', '2026-10-08')).toBe(21);
  });

  it('handles 29 February birthdays', () => {
    expect(ageInYears('2004-02-29', '2025-02-28')).toBe(20);
    expect(ageInYears('2004-02-29', '2025-03-01')).toBe(21);
  });

  it('throws RangeError on a malformed date', () => {
    expect(() => ageInYears('08-10-2005', '2026-10-08')).toThrow(RangeError);
  });
});

describe('daysBetween', () => {
  it('returns whole days, signed', () => {
    expect(daysBetween('2026-10-01', '2026-10-08')).toBe(7);
    expect(daysBetween('2026-10-08', '2026-10-01')).toBe(-7);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2026-10-08', '2026-10-08')).toBe(0);
  });
});
