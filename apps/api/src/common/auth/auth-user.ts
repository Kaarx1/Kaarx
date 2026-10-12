import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { ADMIN_ROLES, ROLES, type AdminRole, type Role } from '@kaarx/shared';

export interface AuthUser {
  id: string;
  role: Role;
  adminRole?: AdminRole;
}

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  adminRole?: AdminRole;
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
}

export const SIGN_IN_REQUIRED = 'Sign in to continue';
export const SESSION_EXPIRED = 'Your session has expired. Sign in again.';

const isRole = (value: unknown): value is Role => (ROLES as readonly unknown[]).includes(value);
const isAdminRole = (value: unknown): value is AdminRole =>
  (ADMIN_ROLES as readonly unknown[]).includes(value);

export function readBearerToken(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export async function verifyAccessToken(jwt: JwtService, token: string): Promise<AuthUser> {
  let payload: Partial<AccessTokenPayload>;
  try {
    payload = await jwt.verifyAsync<Partial<AccessTokenPayload>>(token, { algorithms: ['HS256'] });
  } catch {
    throw new UnauthorizedException(SESSION_EXPIRED);
  }
  const { sub, role, adminRole } = payload;
  if (typeof sub !== 'string' || !isRole(role)) throw new UnauthorizedException(SESSION_EXPIRED);
  if (role !== 'admin') return { id: sub, role };
  if (!isAdminRole(adminRole)) throw new UnauthorizedException(SESSION_EXPIRED);
  return { id: sub, role, adminRole };
}
