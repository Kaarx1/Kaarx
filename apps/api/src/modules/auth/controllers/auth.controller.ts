import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  refreshTokenSchema,
  requestOtpSchema,
  verifyOtpSchema,
  type AuthResponse,
  type RefreshTokenInput,
  type RequestOtpInput,
  type TokenPair,
  type VerifyOtpInput,
} from '@kaarx/shared';
import { Public } from '../../../common/auth/decorators';
import { ZodValidationPipe } from '../../../common/zod-validation.pipe';
import { AuthService } from '../services/auth.service';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  @HttpCode(204)
  requestOtp(@Body(new ZodValidationPipe(requestOtpSchema)) body: RequestOtpInput): Promise<void> {
    return this.auth.requestOtp(body);
  }

  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(
    @Body(new ZodValidationPipe(verifyOtpSchema)) body: VerifyOtpInput,
  ): Promise<AuthResponse> {
    return this.auth.verifyOtp(body);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(
    @Body(new ZodValidationPipe(refreshTokenSchema)) body: RefreshTokenInput,
  ): Promise<TokenPair> {
    return this.auth.refresh(body);
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Body(new ZodValidationPipe(refreshTokenSchema)) body: RefreshTokenInput): Promise<void> {
    return this.auth.logout(body);
  }
}
