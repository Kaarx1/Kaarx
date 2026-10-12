export function normalizeIndianMobile(input: string): string | null {
  const compact = input.trim().replace(/[\s\-().]/g, '');
  let digits: string;
  if (/^\+91\d{10}$/.test(compact)) digits = compact.slice(3);
  else if (/^91\d{10}$/.test(compact)) digits = compact.slice(2);
  else if (/^0\d{10}$/.test(compact)) digits = compact.slice(1);
  else if (/^\d{10}$/.test(compact)) digits = compact;
  else return null;
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}
