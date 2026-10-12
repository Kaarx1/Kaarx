import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { todayIsoDateIST } from '../src/dates';
import {
  MIN_DRIVER_AGE,
  MIN_DRIVER_EXPERIENCE_YEARS,
  createDriverSchema,
  driverDocumentSchema,
  phoneSchema,
  registrationNumberSchema,
  vehicleSchema,
} from '../src/schemas';

function issuesOf(schema: z.ZodType, input: unknown): { path: string; message: string }[] {
  const result = schema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

const today = todayIsoDateIST();
const yearsAgo = (years: number): string => `${Number(today.slice(0, 4)) - years}${today.slice(4)}`;
const inDays = (days: number): string => todayIsoDateIST(new Date(Date.now() + days * 86_400_000));

describe('phoneSchema', () => {
  it.each(['098765 43210', '+91 98765-43210', '9876543210'])('normalizes %j', (input) => {
    expect(phoneSchema.parse(input)).toBe('+919876543210');
  });

  it('rejects a bad number with the spec message', () => {
    expect(issuesOf(phoneSchema, '12345')).toEqual([
      { path: '', message: 'Enter a valid 10-digit Indian mobile number' },
    ]);
  });
});

describe('registrationNumberSchema', () => {
  it('normalizes and rejects with the spec message', () => {
    expect(registrationNumberSchema.parse('ts 09 ab 1234')).toBe('TS09AB1234');
    expect(issuesOf(registrationNumberSchema, 'TS09')).toEqual([
      { path: '', message: 'Enter a valid vehicle number, e.g. TS 09 AB 1234' },
    ]);
  });
});

describe('vehicleSchema', () => {
  const base = {
    registrationNumber: 'ts 09 ab 1234',
    brand: 'Maruti Suzuki',
    model: 'Swift',
    colour: 'White',
    bodyType: 'hatchback',
    fuel: 'petrol',
    transmission: 'manual',
    insuranceStatus: 'insured',
    insuranceValidTill: inDays(30),
    ownershipDeclared: true,
  };

  it('accepts a valid insured vehicle and normalizes the number', () => {
    const parsed = vehicleSchema.parse(base);
    expect(parsed.registrationNumber).toBe('TS09AB1234');
  });

  it('requires a valid-till date for an insured vehicle', () => {
    const { insuranceValidTill: _omit, ...withoutDate } = base;
    expect(issuesOf(vehicleSchema, withoutDate)).toEqual([
      {
        path: 'insuranceValidTill',
        message: 'Insurance valid-till date is required for an insured vehicle',
      },
    ]);
  });

  it('rejects expired insurance and accepts insurance valid till today', () => {
    expect(issuesOf(vehicleSchema, { ...base, insuranceValidTill: '2000-01-01' })).toEqual([
      { path: 'insuranceValidTill', message: 'Insurance has already expired' },
    ]);
    expect(issuesOf(vehicleSchema, { ...base, insuranceValidTill: today })).toEqual([]);
  });

  it('allows an uninsured vehicle without a date', () => {
    const { insuranceValidTill: _omit, ...withoutDate } = base;
    expect(issuesOf(vehicleSchema, { ...withoutDate, insuranceStatus: 'not_insured' })).toEqual([]);
  });

  it('requires the ownership declaration', () => {
    const paths = issuesOf(vehicleSchema, { ...base, ownershipDeclared: false }).map((i) => i.path);
    expect(paths).toEqual(['ownershipDeclared']);
  });
});

describe('createDriverSchema', () => {
  const base = {
    phone: '98490 12345',
    fullName: 'Ravi Kumar',
    dob: yearsAgo(30),
    gender: 'male',
    languages: ['Telugu', 'Hindi'],
    currentAddress: 'Plot 12, Road No. 5, Banjara Hills, Hyderabad',
    emergencyContactName: 'Lakshmi Kumar',
    emergencyContactPhone: '9849012346',
    experienceYears: 6,
    transmission: 'both',
    bodyTypes: ['hatchback', 'sedan'],
  };

  it('accepts a valid driver and fills defaults', () => {
    const parsed = createDriverSchema.parse(base);
    expect(parsed.phone).toBe('+919849012345');
    expect(parsed.preferredLanguage).toBe('en');
    expect(parsed.evExperience).toBe(false);
  });

  it(`requires age ${MIN_DRIVER_AGE} or more`, () => {
    expect(issuesOf(createDriverSchema, { ...base, dob: yearsAgo(21) })).toEqual([]);
    const issues = issuesOf(createDriverSchema, { ...base, dob: yearsAgo(20) });
    expect(issues.map((i) => i.path)).toEqual(['dob']);
  });

  it(`requires ${MIN_DRIVER_EXPERIENCE_YEARS} or more years of experience`, () => {
    expect(issuesOf(createDriverSchema, { ...base, experienceYears: 2 })).toEqual([]);
    const issues = issuesOf(createDriverSchema, { ...base, experienceYears: 1.5 });
    expect(issues.map((i) => i.path)).toEqual(['experienceYears']);
  });
});

describe('driverDocumentSchema', () => {
  it('accepts the last 4 digits of Aadhaar', () => {
    expect(issuesOf(driverDocumentSchema, { type: 'aadhaar', numberMasked: '1234' })).toEqual([]);
  });

  it.each([{ numberMasked: '123456789012' }, { numberMasked: 'XXXX1234' }, {}])(
    'rejects Aadhaar input %j that is not exactly 4 digits',
    (extra) => {
      expect(issuesOf(driverDocumentSchema, { type: 'aadhaar', ...extra })).toEqual([
        { path: 'numberMasked', message: 'Store only the last 4 digits of Aadhaar' },
      ]);
    },
  );

  it('does not apply the Aadhaar rule to other documents', () => {
    expect(issuesOf(driverDocumentSchema, { type: 'pan', numberMasked: 'ABCDE1234F' })).toEqual([]);
  });

  it('requires a reason when a document is rejected', () => {
    const paths = issuesOf(driverDocumentSchema, { type: 'pan', status: 'rejected' }).map(
      (i) => i.path,
    );
    expect(paths).toEqual(['rejectionReason']);
    expect(
      issuesOf(driverDocumentSchema, {
        type: 'pan',
        status: 'rejected',
        rejectionReason: 'Photo is blurred',
      }),
    ).toEqual([]);
  });

  it('defaults status to pending and fileUrls to an empty list', () => {
    const parsed = driverDocumentSchema.parse({ type: 'pan' });
    expect(parsed.status).toBe('pending');
    expect(parsed.fileUrls).toEqual([]);
  });
});
