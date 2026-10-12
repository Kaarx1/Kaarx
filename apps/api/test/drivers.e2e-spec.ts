import { randomUUID } from 'node:crypto';
import { todayIsoDateIST, type VehicleSnapshot } from '@kaarx/shared';
import { DriversService } from '../src/modules/drivers/drivers.service';
import {
  insertApprovedDriver,
  isoDaysAgo,
  loginAdmin,
  loginDriver,
  loginWithOtp,
  validDriverInput,
} from './helpers/factories';
import { api, bearer, createTestApp, resetState, type TestContext } from './helpers/test-app';

describe('drivers (admin onboarding)', () => {
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

  async function createDriver(token: string, overrides: Record<string, unknown> = {}) {
    const input = { ...validDriverInput(), ...overrides };
    const res = await api(ctx).post('/admin/drivers').set(bearer(token)).send(input).expect(201);
    return { input, driver: res.body as { id: string; phone: string; code: string } };
  }

  async function addReadyDocuments(
    token: string,
    driverId: string,
    pvcIssueDate: string,
  ): Promise<void> {
    const documents = [
      {
        type: 'driving_licence',
        numberMasked: 'TS0920190012345',
        issueDate: '2019-01-15',
        expiryDate: '2039-01-14',
        status: 'approved',
      },
      { type: 'aadhaar', numberMasked: '4321', status: 'approved' },
      { type: 'pan', numberMasked: 'ABCDE1234F', status: 'approved' },
      {
        type: 'police_verification',
        numberMasked: 'PVC-889',
        issueDate: pvcIssueDate,
        status: 'approved',
      },
    ];
    for (const document of documents) {
      await api(ctx)
        .post(`/admin/drivers/${driverId}/documents`)
        .set(bearer(token))
        .send(document)
        .expect(201);
    }
  }

  async function completeOnboarding(token: string, driverId: string): Promise<void> {
    const now = new Date().toISOString();
    await api(ctx)
      .patch(`/admin/drivers/${driverId}/onboarding`)
      .set(bearer(token))
      .send({
        trainingCompletedAt: now,
        agreementVersion: 'v1',
        agreementSignedAt: now,
        codeOfConductSignedAt: now,
        idCardNumber: 'KX-ID-0001',
      })
      .expect(200);
  }

  it('creates a driver who can log in but cannot drive yet', async () => {
    const { token } = await loginAdmin(ctx, 'ops_manager');
    const { input, driver } = await createDriver(token);
    expect(driver.code).toMatch(/^KD-\d{4}$/);

    const auth = await loginWithOtp(ctx, 'driver', input.phone);
    expect(auth.profile).toMatchObject({
      id: driver.id,
      canDrive: false,
      verificationStatus: 'pending',
    });

    const list = await api(ctx).get('/admin/drivers?status=pending').set(bearer(token)).expect(200);
    expect((list.body as { id: string }[]).map((d) => d.id)).toContain(driver.id);
  });

  it('rejects drivers under 21 or with less than 2 years of experience', async () => {
    const { token } = await loginAdmin(ctx, 'ops_manager');
    const young = await api(ctx)
      .post('/admin/drivers')
      .set(bearer(token))
      .send({ ...validDriverInput(), dob: isoDaysAgo(365 * 20) })
      .expect(400);
    expect(JSON.stringify(young.body.issues)).toContain('dob');
    const junior = await api(ctx)
      .post('/admin/drivers')
      .set(bearer(token))
      .send({ ...validDriverInput(), experienceYears: 1 })
      .expect(400);
    expect(JSON.stringify(junior.body.issues)).toContain('experienceYears');
  });

  it('returns 409 for a duplicate phone number', async () => {
    const { token } = await loginAdmin(ctx, 'ops_manager');
    const { input } = await createDriver(token);
    const res = await api(ctx)
      .post('/admin/drivers')
      .set(bearer(token))
      .send({ ...validDriverInput(), phone: input.phone })
      .expect(409);
    expect(res.body.message).toBe('A driver with this phone number already exists');
  });

  it('refuses a full Aadhaar number', async () => {
    const { token } = await loginAdmin(ctx, 'verification_agent');
    const { driver } = await createDriver(token);
    const res = await api(ctx)
      .post(`/admin/drivers/${driver.id}/documents`)
      .set(bearer(token))
      .send({ type: 'aadhaar', numberMasked: '123412341234', status: 'approved' })
      .expect(400);
    expect(JSON.stringify(res.body.issues)).toContain('Store only the last 4 digits of Aadhaar');
  });

  it('lists what is missing, then approves once documents and onboarding are complete', async () => {
    const { token } = await loginAdmin(ctx, 'verification_agent');
    const { input, driver } = await createDriver(token);

    const blocked = await api(ctx)
      .post(`/admin/drivers/${driver.id}/approve`)
      .set(bearer(token))
      .expect(409);
    expect(blocked.body).toEqual({
      message: 'Driver is not ready for approval',
      missing: [
        'driving_licence',
        'aadhaar',
        'pan',
        'police_verification',
        'induction_training',
        'driver_agreement',
        'code_of_conduct',
      ],
    });

    await addReadyDocuments(token, driver.id, isoDaysAgo(10));
    await completeOnboarding(token, driver.id);
    const approved = await api(ctx)
      .post(`/admin/drivers/${driver.id}/approve`)
      .set(bearer(token))
      .expect(200);
    expect(approved.body.verificationStatus).toBe('approved');
    expect(approved.body.activatedAt).toEqual(expect.any(String));

    const detail = await api(ctx).get(`/admin/drivers/${driver.id}`).set(bearer(token)).expect(200);
    expect(detail.body.driver.id).toBe(driver.id);
    expect(detail.body.documents).toHaveLength(4);

    const audit: { action: string }[] = await ctx.ds.query(
      `select action from audit_logs where entity_type = 'driver' and entity_id = $1 order by id`,
      [driver.id],
    );
    expect(audit.map((row) => row.action)).toEqual([
      'driver.created',
      'driver.document_added',
      'driver.document_added',
      'driver.document_added',
      'driver.document_added',
      'driver.onboarding_updated',
      'driver.approved',
    ]);

    const driverToken = (await loginWithOtp(ctx, 'driver', input.phone)).accessToken;
    const me = await api(ctx).get('/driver/me').set(bearer(driverToken)).expect(200);
    expect(me.body).toMatchObject({
      id: driver.id,
      canDrive: true,
      verificationStatus: 'approved',
    });
  });

  it('requires the police verification to be at least 7 days old', async () => {
    const { token } = await loginAdmin(ctx, 'ops_manager');
    const { driver } = await createDriver(token);
    await addReadyDocuments(token, driver.id, todayIsoDateIST());
    await completeOnboarding(token, driver.id);
    const res = await api(ctx)
      .post(`/admin/drivers/${driver.id}/approve`)
      .set(bearer(token))
      .expect(409);
    expect(res.body.missing).toEqual(['police_verification_7_days']);
  });

  it('does not let a support agent approve', async () => {
    const ops = await loginAdmin(ctx, 'ops_manager');
    const { driver } = await createDriver(ops.token);
    const support = await loginAdmin(ctx, 'support_agent');
    await api(ctx)
      .post(`/admin/drivers/${driver.id}/approve`)
      .set(bearer(support.token))
      .expect(403);
    await api(ctx).get(`/admin/drivers/${driver.id}`).set(bearer(support.token)).expect(200);
  });

  it('suspends and reinstates a driver', async () => {
    const { token } = await loginAdmin(ctx, 'ops_manager');
    const driver = await insertApprovedDriver(ctx);
    const driverToken = await loginDriver(ctx, driver);

    await api(ctx)
      .post(`/admin/drivers/${driver.id}/suspend`)
      .set(bearer(token))
      .send({ reason: 'Customer complaint under review' })
      .expect(200);
    const suspended = await api(ctx).get('/driver/me').set(bearer(driverToken)).expect(200);
    expect(suspended.body.canDrive).toBe(false);
    await expect(ctx.app.get(DriversService).assertCanDrive(driver.id)).rejects.toThrow(
      'Your account is suspended. Contact Kaarx support.',
    );

    await api(ctx).post(`/admin/drivers/${driver.id}/reinstate`).set(bearer(token)).expect(200);
    const reinstated = await api(ctx).get('/driver/me').set(bearer(driverToken)).expect(200);
    expect(reinstated.body.canDrive).toBe(true);

    const again = await api(ctx)
      .post(`/admin/drivers/${driver.id}/reinstate`)
      .set(bearer(token))
      .expect(409);
    expect(again.body.message).toBe('Only a suspended driver can be reinstated');
  });

  it('assertCanDrive explains an unapproved account', async () => {
    const { token } = await loginAdmin(ctx, 'ops_manager');
    const { driver } = await createDriver(token);
    await expect(ctx.app.get(DriversService).assertCanDrive(driver.id)).rejects.toThrow(
      'Your account is not approved yet. Kaarx will contact you.',
    );
  });

  it('returns 404 for an unknown driver', async () => {
    const { token } = await loginAdmin(ctx);
    const res = await api(ctx).get(`/admin/drivers/${randomUUID()}`).set(bearer(token)).expect(404);
    expect(res.body.message).toBe('Driver not found');
  });

  describe('findEligibleForOffer', () => {
    const car = (overrides: Partial<VehicleSnapshot> = {}): VehicleSnapshot => ({
      registrationNumber: 'TS09AB1234',
      brand: 'Tata',
      model: 'Tiago',
      colour: 'Blue',
      bodyType: 'hatchback',
      fuel: 'petrol',
      transmission: 'manual',
      insuranceStatus: 'insured',
      insuranceValidTill: '2099-12-31',
      notes: null,
      ...overrides,
    });

    it('filters by transmission, body type, EV experience and approval', async () => {
      const allTypes = ['hatchback', 'sedan', 'suv', 'muv', 'luxury'] as const;
      const both = await insertApprovedDriver(ctx, {
        transmission: 'both',
        bodyTypes: [...allTypes],
        evExperience: true,
      });
      const automatic = await insertApprovedDriver(ctx, {
        transmission: 'automatic',
        bodyTypes: [...allTypes],
        evExperience: true,
      });
      const sedanOnly = await insertApprovedDriver(ctx, {
        transmission: 'both',
        bodyTypes: ['sedan'],
        evExperience: true,
      });
      const noEv = await insertApprovedDriver(ctx, {
        transmission: 'both',
        bodyTypes: ['hatchback'],
        evExperience: false,
      });
      const suspended = await insertApprovedDriver(ctx, {
        transmission: 'both',
        bodyTypes: [...allTypes],
        evExperience: true,
        verificationStatus: 'suspended',
      });
      const candidates = [both.id, automatic.id, sedanOnly.id, noEv.id, suspended.id];
      const service = ctx.app.get(DriversService);
      const bookingId = randomUUID();

      const manualPetrol = await service.findEligibleForOffer(candidates, car(), bookingId);
      expect([...manualPetrol].sort()).toEqual([both.id, noEv.id].sort());

      const manualEv = await service.findEligibleForOffer(
        candidates,
        car({ fuel: 'electric' }),
        bookingId,
      );
      expect([...manualEv]).toEqual([both.id]);

      const automaticSedan = await service.findEligibleForOffer(
        candidates,
        car({ transmission: 'automatic', bodyType: 'sedan' }),
        bookingId,
      );
      expect([...automaticSedan].sort()).toEqual([both.id, automatic.id, sedanOnly.id].sort());

      await expect(service.findEligibleForOffer([], car(), bookingId)).resolves.toEqual(new Set());
      await expect(service.findLiveBooking(both.id)).resolves.toBeNull();
    });
  });
});
