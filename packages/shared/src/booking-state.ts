import { LIVE_BOOKING_STATUSES, type BookingStatus } from './enums';

const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  searching: ['assigned', 'cancelled', 'no_driver_found'],
  assigned: ['driver_arrived', 'cancelled', 'searching'],
  driver_arrived: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
  no_driver_found: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: BookingStatus,
    readonly to: BookingStatus,
  ) {
    super(`Cannot move a booking from ${from} to ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export function isLiveStatus(status: BookingStatus): boolean {
  return (LIVE_BOOKING_STATUSES as readonly BookingStatus[]).includes(status);
}
