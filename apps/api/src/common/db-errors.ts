import { QueryFailedError } from 'typeorm';

interface PgDriverError {
  code?: string;
  constraint?: string;
}

export function isUniqueViolation(error: unknown, constraintName?: string): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError = error.driverError as Error & PgDriverError;
  if (driverError.code !== '23505') return false;
  return constraintName === undefined || driverError.constraint === constraintName;
}
