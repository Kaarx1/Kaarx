export const REALTIME_EVENTS = {
  ready: 'ready',
  authError: 'auth_error',
  offerNew: 'offer.new',
  offerWithdrawn: 'offer.withdrawn',
  bookingUpdated: 'booking.updated',
  driverLocation: 'driver.location',
  sosRaised: 'sos.raised',
} as const;

export type RealtimeEventName = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];
