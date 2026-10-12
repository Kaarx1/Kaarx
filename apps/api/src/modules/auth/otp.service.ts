import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { AppKind } from '@kaarx/shared';
import { REDIS } from '../../common/redis.module';
import { env } from '../../config/env';
import { SmsProvider } from './sms.provider';

export const FIXED_OTP = '123456';
const CODE_TTL_SEC = 600;
const COOLDOWN_SEC = 30;
const MAX_WRONG_ATTEMPTS = 5;

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

function otpKeys(
  app: AppKind,
  phone: string,
): { code: string; cooldown: string; attempts: string } {
  return {
    code: `otp:code:${app}:${phone}`,
    cooldown: `otp:cooldown:${app}:${phone}`,
    attempts: `otp:attempts:${app}:${phone}`,
  };
}

@Injectable()
export class OtpService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly sms: SmsProvider,
  ) {}

  async issue(app: AppKind, phone: string): Promise<void> {
    const keys = otpKeys(app, phone);
    const fresh = await this.redis.set(keys.cooldown, '1', 'EX', COOLDOWN_SEC, 'NX');
    if (fresh === null) {
      throw new HttpException(
        'Please wait 30 seconds before asking for a new code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const code =
      env.OTP_MODE === 'fixed' ? FIXED_OTP : randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.redis.set(keys.code, sha256(code), 'EX', CODE_TTL_SEC);
    try {
      await this.sms.sendOtp(phone, code);
    } catch (error) {
      await this.redis.del(keys.code, keys.cooldown);
      throw error;
    }
  }

  async verify(app: AppKind, phone: string, code: string): Promise<void> {
    const keys = otpKeys(app, phone);
    const attempts = await this.redis.incr(keys.attempts);
    if (attempts === 1) await this.redis.expire(keys.attempts, CODE_TTL_SEC);
    if (attempts > MAX_WRONG_ATTEMPTS) {
      throw new HttpException(
        'Too many wrong attempts. Try again in 10 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const stored = await this.redis.get(keys.code);
    if (stored === null)
      throw new UnauthorizedException('This code has expired. Request a new one.');
    if (!timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(sha256(code), 'hex'))) {
      throw new UnauthorizedException('That code is incorrect');
    }
    await this.redis.del(keys.code, keys.attempts, keys.cooldown);
  }
}
