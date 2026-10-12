import type { BookingStatus } from './enums';

export interface PricingRuleInput {
  baseFarePaise: number;
  includedKm: number;
  perKmPaise: number;
  serviceFeePaise: number;
  platformCommissionPct: number;
  freeWaitingMin: number;
  waitingPerMinPaise: number;
  minFarePaise: number;
}

export interface FareBreakdown {
  baseFarePaise: number;
  distanceKm: number;
  distanceChargePaise: number;
  waitingMin: number;
  waitingChargePaise: number;
  minFareTopUpPaise: number;
  serviceFeePaise: number;
  totalPaise: number;
}

export interface Settlement {
  platformFeePaise: number;
  driverEarningPaise: number;
}

export interface CancellationFeeInput {
  status: BookingStatus;
  assignedAt: Date | null;
  now: Date;
  graceSec: number;
  feePaise: number;
}

export function toRupee(paise: number): number {
  return Math.round(paise / 100) * 100;
}

export function computeFare(
  rule: PricingRuleInput,
  { distanceM, waitingS }: { distanceM: number; waitingS: number },
): FareBreakdown {
  if (distanceM < 0 || waitingS < 0) {
    throw new RangeError('distanceM and waitingS must not be negative');
  }
  const distanceKm = Math.round(distanceM / 100) / 10;
  const distanceChargePaise = toRupee(Math.max(0, distanceKm - rule.includedKm) * rule.perKmPaise);
  const waitingMin = Math.ceil(waitingS / 60);
  const waitingChargePaise =
    Math.max(0, waitingMin - rule.freeWaitingMin) * rule.waitingPerMinPaise;
  const rideSubtotal = rule.baseFarePaise + distanceChargePaise + waitingChargePaise;
  const minFareTopUpPaise = Math.max(0, rule.minFarePaise - rideSubtotal);
  return {
    baseFarePaise: rule.baseFarePaise,
    distanceKm,
    distanceChargePaise,
    waitingMin,
    waitingChargePaise,
    minFareTopUpPaise,
    serviceFeePaise: rule.serviceFeePaise,
    totalPaise: rideSubtotal + minFareTopUpPaise + rule.serviceFeePaise,
  };
}

export function computeSettlement(totalPaise: number, commissionPct: number): Settlement {
  const platformFeePaise = toRupee((totalPaise * commissionPct) / 100);
  return { platformFeePaise, driverEarningPaise: totalPaise - platformFeePaise };
}

export function computeCancellationFee({
  status,
  assignedAt,
  now,
  graceSec,
  feePaise,
}: CancellationFeeInput): number {
  if (status === 'searching' || assignedAt === null) return 0;
  return (now.getTime() - assignedAt.getTime()) / 1000 > graceSec ? feePaise : 0;
}
