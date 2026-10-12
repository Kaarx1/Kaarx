import {
  createParamDecorator,
  SetMetadata,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { AdminRole, Role } from '@kaarx/shared';
import { SIGN_IN_REQUIRED, type AuthenticatedRequest, type AuthUser } from './auth-user';

export const IS_PUBLIC_KEY = 'kaarx:public';
export const ROLES_KEY = 'kaarx:roles';
export const ADMIN_ROLES_KEY = 'kaarx:admin-roles';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
export const AdminRoles = (...roles: AdminRole[]) => SetMetadata(ADMIN_ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw new UnauthorizedException(SIGN_IN_REQUIRED);
    return user;
  },
);
