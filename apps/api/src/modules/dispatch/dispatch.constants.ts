export const DISPATCH_QUEUE = 'dispatch';
export const DISPATCH_ROUND_JOB = 'round';

export interface DispatchJobData {
  bookingId: string;
  round: number;
}

export function roundJobId(bookingId: string, round: number): string {
  return `${bookingId}-r${round}`;
}
