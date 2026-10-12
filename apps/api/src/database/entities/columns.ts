import type { LatLng } from '@kaarx/shared';
import type { ValueTransformer } from 'typeorm';

export const ACCOUNT_STATUSES = ['active', 'blocked'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const BOOKING_TYPES = ['instant', 'scheduled'] as const;
export type BookingType = (typeof BOOKING_TYPES)[number];

export const SOS_STATUSES = ['open', 'handled'] as const;
export type SosStatus = (typeof SOS_STATUSES)[number];

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export function toGeoPoint({ lat, lng }: LatLng): GeoPoint {
  return { type: 'Point', coordinates: [lng, lat] };
}

export function fromGeoPoint(point: GeoPoint): LatLng {
  const [lng, lat] = point.coordinates;
  return { lat, lng };
}

export const numericTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | number | null) => (value === null ? null : Number(value)),
};

export const numericArrayTransformer: ValueTransformer = {
  to: (value: number[] | null | undefined) => value,
  from: (value: Array<string | number> | null) => (value === null ? null : value.map(Number)),
};
