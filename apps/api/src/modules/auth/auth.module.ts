import { Module } from '@nestjs/common';
import { env } from '../../config/env';
import { AdminAuthController } from './admin-auth.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { ConsoleSmsProvider, Msg91SmsProvider, SmsProvider } from './sms.provider';
import { TokensService } from './tokens.service';

@Module({
  controllers: [AuthController, AdminAuthController],
  providers: [
    OtpService,
    TokensService,
    AuthService,
    {
      provide: SmsProvider,
      useFactory: (): SmsProvider =>
        env.OTP_MODE === 'sms' && env.MSG91_AUTH_KEY && env.MSG91_OTP_TEMPLATE_ID
          ? new Msg91SmsProvider(env.MSG91_AUTH_KEY, env.MSG91_OTP_TEMPLATE_ID)
          : new ConsoleSmsProvider(),
    },
  ],
})
export class AuthModule {}
