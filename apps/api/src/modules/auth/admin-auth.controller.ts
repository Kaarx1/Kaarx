import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  adminLoginSchema,
  type AdminAuthResponse,
  type AdminLoginInput,
  type AdminProfile,
} from '@kaarx/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public, Roles } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthService } from './auth.service';

@Controller('admin')
export class AdminAuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  login(
    @Body(new ZodValidationPipe(adminLoginSchema)) body: AdminLoginInput,
  ): Promise<AdminAuthResponse> {
    return this.auth.adminLogin(body);
  }

  @Roles('admin')
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<AdminProfile> {
    return this.auth.getAdminProfile(user.id);
  }
}
