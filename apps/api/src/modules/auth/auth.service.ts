import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';
import type {
  AdminAuthResponse,
  AdminLoginInput,
  AdminProfile,
  AuthResponse,
  RefreshTokenInput,
  RequestOtpInput,
  Role,
  TokenPair,
  VerifyOtpInput,
} from '@kaarx/shared';
import { AdminUser, Customer, Driver } from '../../database/entities';
import { toCustomerProfile } from '../customers/customer.views';
import { toDriverSelfView } from '../drivers/driver.views';
import { OtpService } from './otp.service';
import { TokensService, type TokenSubject } from './tokens.service';

const DRIVER_NOT_REGISTERED =
  'This number is not registered with Kaarx Crew. Contact Kaarx to join as a driver.';
export const ACCOUNT_BLOCKED = 'This account is blocked. Contact Kaarx support.';

export function toAdminProfile(admin: AdminUser): AdminProfile {
  return { id: admin.id, email: admin.email, fullName: admin.fullName, role: admin.role };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Driver) private readonly drivers: Repository<Driver>,
    @InjectRepository(AdminUser) private readonly admins: Repository<AdminUser>,
    private readonly otp: OtpService,
    private readonly tokens: TokensService,
  ) {}

  async requestOtp({ phone, app }: RequestOtpInput): Promise<void> {
    const account =
      app === 'driver'
        ? await this.drivers.findOneBy({ phone })
        : await this.customers.findOneBy({ phone });
    if (app === 'driver' && !account) throw new NotFoundException(DRIVER_NOT_REGISTERED);
    if (account?.status === 'blocked') throw new ForbiddenException(ACCOUNT_BLOCKED);
    await this.otp.issue(app, phone);
  }

  async verifyOtp({ phone, app, code }: VerifyOtpInput): Promise<AuthResponse> {
    await this.otp.verify(app, phone, code);
    if (app === 'driver') {
      const driver = await this.drivers.findOneBy({ phone });
      if (!driver) throw new NotFoundException(DRIVER_NOT_REGISTERED);
      if (driver.status === 'blocked') throw new ForbiddenException(ACCOUNT_BLOCKED);
      const pair = await this.tokens.issue({ id: driver.id, role: 'driver' });
      return { ...pair, role: 'driver', profile: toDriverSelfView(driver) };
    }
    await this.customers.createQueryBuilder().insert().values({ phone }).orIgnore().execute();
    const customer = await this.customers.findOneByOrFail({ phone });
    if (customer.status === 'blocked') throw new ForbiddenException(ACCOUNT_BLOCKED);
    const pair = await this.tokens.issue({ id: customer.id, role: 'customer' });
    return { ...pair, role: 'customer', profile: toCustomerProfile(customer) };
  }

  async refresh({ refreshToken }: RefreshTokenInput): Promise<TokenPair> {
    const row = await this.tokens.consume(refreshToken);
    const found = await this.findTokenSubject(row.subjectType, row.subjectId);
    if (!found || found.status !== 'active') {
      await this.tokens.revokeAllForSubject(row.subjectType, row.subjectId);
      throw new ForbiddenException(ACCOUNT_BLOCKED);
    }
    return this.tokens.issue(found.subject);
  }

  async logout({ refreshToken }: RefreshTokenInput): Promise<void> {
    await this.tokens.revoke(refreshToken);
  }

  async adminLogin({ email, password }: AdminLoginInput): Promise<AdminAuthResponse> {
    const admin = await this.admins
      .createQueryBuilder('admin')
      .where('lower(admin.email) = lower(:email)', { email })
      .getOne();
    if (!admin || !(await argon2.verify(admin.passwordHash, password))) {
      throw new UnauthorizedException('Incorrect email or password');
    }
    if (admin.status !== 'active') throw new ForbiddenException(ACCOUNT_BLOCKED);
    await this.admins.update(admin.id, { lastLoginAt: new Date() });
    const pair = await this.tokens.issue({ id: admin.id, role: 'admin', adminRole: admin.role });
    return { ...pair, profile: toAdminProfile(admin) };
  }

  async getAdminProfile(adminId: string): Promise<AdminProfile> {
    const admin = await this.admins.findOneBy({ id: adminId });
    if (!admin) throw new NotFoundException('Admin not found');
    return toAdminProfile(admin);
  }

  private async findTokenSubject(
    role: Role,
    id: string,
  ): Promise<{ status: string; subject: TokenSubject } | null> {
    if (role === 'admin') {
      const admin = await this.admins.findOneBy({ id });
      return admin ? { status: admin.status, subject: { id, role, adminRole: admin.role } } : null;
    }
    const account =
      role === 'driver'
        ? await this.drivers.findOneBy({ id })
        : await this.customers.findOneBy({ id });
    return account ? { status: account.status, subject: { id, role } } : null;
  }
}
