const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86_400_000;

interface DateParts {
  y: number;
  m: number;
  d: number;
}

function parseIsoDate(iso: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new RangeError(`Invalid ISO date: ${iso}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function todayIsoDateIST(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function ageInYears(dobIso: string, todayIso: string): number {
  const dob = parseIsoDate(dobIso);
  const today = parseIsoDate(todayIso);
  const beforeBirthday = today.m < dob.m || (today.m === dob.m && today.d < dob.d);
  return today.y - dob.y - (beforeBirthday ? 1 : 0);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  return Math.round(
    (Date.UTC(to.y, to.m - 1, to.d) - Date.UTC(from.y, from.m - 1, from.d)) / DAY_MS,
  );
}
