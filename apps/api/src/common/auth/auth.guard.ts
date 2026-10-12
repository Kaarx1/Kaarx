import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AdminRole, Role } from '@kaarx/shared';
import {
  readBearerToken,
  SIGN_IN_REQUIRED,
  verifyAccessToken,
  type AuthenticatedRequest,
} from './auth-user';
import { ADMIN_ROLES_KEY, IS_PUBLIC_KEY, ROLES_KEY } from './decorators';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Sockets authenticate on connect in the realtime gateway.
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) return true;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (!roles || roles.length === 0) throw new ForbiddenException('This route is not available');

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException(SIGN_IN_REQUIRED);
    const user = await verifyAccessToken(this.jwt, token);

    if (!roles.includes(user.role))
      throw new ForbiddenException('You do not have access to this page');
    const adminRoles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(
      ADMIN_ROLES_KEY,
      targets,
    );
    if (
      user.role === 'admin' &&
      adminRoles &&
      adminRoles.length > 0 &&
      user.adminRole !== 'super_admin' &&
      !(user.adminRole && adminRoles.includes(user.adminRole))
    ) {
      throw new ForbiddenException('Your admin role cannot do this');
    }

    request.user = user;
    return true;
  }
}
