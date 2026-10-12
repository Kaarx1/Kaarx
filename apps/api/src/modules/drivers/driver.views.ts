import type { DriverSelfView, PublicDriver } from '@kaarx/shared';
import type { Driver } from '../../database/entities';

export function canDrive(driver: Driver, now: Date = new Date()): boolean {
  return (
    driver.status === 'active' &&
    driver.verificationStatus === 'approved' &&
    (driver.suspendedUntil === null || driver.suspendedUntil.getTime() <= now.getTime())
  );
}

export function toDriverSelfView(driver: Driver): DriverSelfView {
  return {
    id: driver.id,
    code: driver.code,
    phone: driver.phone,
    fullName: driver.fullName,
    photoUrl: driver.photoUrl,
    verificationStatus: driver.verificationStatus,
    canDrive: canDrive(driver),
    ratingAvg: driver.ratingAvg,
    totalTrips: driver.totalTrips,
  };
}

function displayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

export function toPublicDriver(driver: Driver): PublicDriver {
  return {
    id: driver.id,
    displayName: displayName(driver.fullName),
    photoUrl: driver.photoUrl,
    ratingAvg: driver.ratingAvg,
    totalTrips: driver.totalTrips,
    experienceYears: driver.experienceYears,
    languages: driver.languages,
    verified: true,
  };
}
