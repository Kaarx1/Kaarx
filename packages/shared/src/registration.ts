const STATE_SERIES = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/;
const BH_SERIES = /^\d{2}BH\d{4}[A-Z]{1,2}$/;

export function normalizeRegistrationNumber(input: string): string | null {
  const compact = input.toUpperCase().replace(/[\s-]/g, '');
  return STATE_SERIES.test(compact) || BH_SERIES.test(compact) ? compact : null;
}
