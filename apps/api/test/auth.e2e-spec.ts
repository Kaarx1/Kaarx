import { normalizeIndianMobile } from '@kaarx/shared';
import { FIXED_OTP } from '../src/modules/auth/otp.service';
import { toPublicDriver } from '../src/modules/drivers/driver.views';
import {
  ADMIN_PASSWORD,
  insertAdmin,
  insertApprovedDriver,
  loginAdmin,
  loginCustomer,
  loginWithOtp,
  uniquePhone,
} from './helpers/factories';
import { api, bearer, createTestApp, resetState, type TestContext } from './helpers/test-app';

describe('auth', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
  });

  describe('customer and driver OTP', () => {
    it('creates a customer on first login with the fixed OTP', async () => {
      const phone = uniquePhone();
      const auth = await loginWithOtp(ctx, 'customer', phone);
      expect(auth.role).toBe('customer');
      expect(auth.accessToken).toEqual(expect.any(String));
      expect(auth.refreshToken.length).toBeGreaterThanOrEqual(20);
      expect(auth.profile).toMatchObject({
        phone: normalizeIndianMobile(phone),
        fullName: null,
        profileComplete: false,
      });
    });

    it('maps every way of writing one number to the same customer', async () => {
      const a = await loginWithOtp(ctx, 'customer', '098765 43210');
      const b = await loginWithOtp(ctx, 'customer', '+91 98765-43210');
      const c = await loginWithOtp(ctx, 'customer', '9876543210');
      expect(a.profile.phone).toBe('+919876543210');
      expect(b.profile.id).toBe(a.profile.id);
      expect(c.profile.id).toBe(a.profile.id);
      const rows: { count: number }[] = await ctx.ds.query(
        `select count(*)::int as count from customers where phone = '+919876543210'`,
      );
      expect(rows[0]?.count).toBe(1);
    });

    it('rejects an invalid phone number with 400', async () => {
      const res = await api(ctx)
        .post('/auth/otp/request')
        .send({ phone: '12345', app: 'customer' })
        .expect(400);
      expect(res.body.message).toBe('Validation failed');
    });

    it('returns 401 for a wrong code and 429 on the 6th attempt even when correct', async () => {
      const phone = uniquePhone();
      await api(ctx).post('/auth/otp/request').send({ phone, app: 'customer' }).expect(204);
      for (let i = 0; i < 5; i += 1) {
        const wrong = await api(ctx)
          .post('/auth/otp/verify')
          .send({ phone, app: 'customer', code: '000000' })
          .expect(401);
        expect(wrong.body.message).toBe('That code is incorrect');
      }
      const locked = await api(ctx)
        .post('/auth/otp/verify')
        .send({ phone, app: 'customer', code: FIXED_OTP })
        .expect(429);
      expect(locked.body.message).toBe('Too many wrong attempts. Try again in 10 minutes.');
    });

    it('enforces the 30 second resend cooldown', async () => {
      const phone = uniquePhone();
      await api(ctx).post('/auth/otp/request').send({ phone, app: 'customer' }).expect(204);
      const res = await api(ctx)
        .post('/auth/otp/request')
        .send({ phone, app: 'customer' })
        .expect(429);
      expect(res.body.message).toBe('Please wait 30 seconds before asking for a new code');
    });

    it('returns 404 when an unknown number asks for a driver OTP', async () => {
      const res = await api(ctx)
        .post('/auth/otp/request')
        .send({ phone: uniquePhone(), app: 'driver' })
        .expect(404);
      expect(res.body.message).toBe(
        'This number is not registered with Kaarx Crew. Contact Kaarx to join as a driver.',
      );
    });

    it('returns 403 when a blocked customer asks for an OTP', async () => {
      const customer = await loginCustomer(ctx);
      await ctx.ds.query(`update customers set status = 'blocked' where id = $1`, [customer.id]);
      const res = await api(ctx)
        .post('/auth/otp/request')
        .send({ phone: customer.phone, app: 'customer' })
        .expect(403);
      expect(res.body.message).toBe('This account is blocked. Contact Kaarx support.');
    });

    it('logs in an approved driver with canDrive true', async () => {
      const driver = await insertApprovedDriver(ctx);
      const auth = await loginWithOtp(ctx, 'driver', driver.phone);
      expect(auth.role).toBe('driver');
      expect(auth.profile).toMatchObject({
        id: driver.id,
        canDrive: true,
        verificationStatus: 'approved',
      });
    });

    it('shortens the public driver name to first name and last initial', async () => {
      const driver = await insertApprovedDriver(ctx);
      expect(toPublicDriver({ ...driver, fullName: 'Ravi Kumar' }).displayName).toBe('Ravi K.');
      expect(toPublicDriver({ ...driver, fullName: 'Ravi' }).displayName).toBe('Ravi');
      expect(toPublicDriver(driver).verified).toBe(true);
    });
  });

  describe('refresh tokens', () => {
    it('rotates on refresh and revokes the whole family when an old token is reused', async () => {
      const first = await loginCustomer(ctx);
      const second = await api(ctx)
        .post('/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);
      expect(second.body.accessToken).toEqual(expect.any(String));
      expect(second.body.refreshToken).not.toBe(first.refreshToken);

      await api(ctx).post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
      await api(ctx)
        .post('/auth/refresh')
        .send({ refreshToken: second.body.refreshToken })
        .expect(401);
    });

    it('refuses to refresh a blocked account', async () => {
      const customer = await loginCustomer(ctx);
      await ctx.ds.query(`update customers set status = 'blocked' where id = $1`, [customer.id]);
      await api(ctx)
        .post('/auth/refresh')
        .send({ refreshToken: customer.refreshToken })
        .expect(403);
    });

    it('logout revokes the refresh token', async () => {
      const customer = await loginCustomer(ctx);
      await api(ctx).post('/auth/logout').send({ refreshToken: customer.refreshToken }).expect(204);
      await api(ctx)
        .post('/auth/refresh')
        .send({ refreshToken: customer.refreshToken })
        .expect(401);
    });
  });

  describe('admin', () => {
    it('logs in with email and password and reads /admin/me', async () => {
      const admin = await insertAdmin(ctx, 'ops_manager');
      const login = await api(ctx)
        .post('/admin/auth/login')
        .send({ email: admin.email.toUpperCase(), password: ADMIN_PASSWORD })
        .expect(200);
      expect(login.body.profile).toEqual({
        id: admin.id,
        email: admin.email,
        fullName: 'Test Admin',
        role: 'ops_manager',
      });
      const me = await api(ctx).get('/admin/me').set(bearer(login.body.accessToken)).expect(200);
      expect(me.body.role).toBe('ops_manager');
    });

    it('returns 401 for a wrong password', async () => {
      const admin = await insertAdmin(ctx);
      const res = await api(ctx)
        .post('/admin/auth/login')
        .send({ email: admin.email, password: 'not-the-password' })
        .expect(401);
      expect(res.body.message).toBe('Incorrect email or password');
    });

    it('returns 403 for a customer token and 401 without a token on /admin/me', async () => {
      const customer = await loginCustomer(ctx);
      await api(ctx).get('/admin/me').set(bearer(customer.token)).expect(403);
      await api(ctx).get('/admin/me').expect(401);
      const { token } = await loginAdmin(ctx);
      await api(ctx).get('/admin/me').set(bearer(token)).expect(200);
    });
  });
});
