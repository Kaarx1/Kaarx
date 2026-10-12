import { ConflictException } from '@nestjs/common';
import { CustomersService } from '../src/modules/customers/customers.service';
import { addVehicle, loginCustomer, loginReadyCustomer, VALID_VEHICLE } from './helpers/factories';
import { api, bearer, createTestApp, resetState, type TestContext } from './helpers/test-app';

describe('customers', () => {
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

  describe('profile', () => {
    it('updates the profile and reports profileComplete', async () => {
      const customer = await loginCustomer(ctx);
      const before = await api(ctx).get('/customer/me').set(bearer(customer.token)).expect(200);
      expect(before.body.profileComplete).toBe(false);

      const nameOnly = await api(ctx)
        .patch('/customer/me')
        .set(bearer(customer.token))
        .send({ fullName: 'Asha Reddy', email: 'asha@example.com', preferredLanguage: 'te' })
        .expect(200);
      expect(nameOnly.body).toMatchObject({
        fullName: 'Asha Reddy',
        email: 'asha@example.com',
        preferredLanguage: 'te',
        profileComplete: false,
      });

      const complete = await api(ctx)
        .patch('/customer/me')
        .set(bearer(customer.token))
        .send({ fullName: 'Asha Reddy', ageConfirmed: true })
        .expect(200);
      expect(complete.body.profileComplete).toBe(true);
    });

    it('requires a token on customer routes', async () => {
      await api(ctx).get('/customer/me').expect(401);
    });

    it('assertCanBook blocks incomplete profiles and returns the contact card once ready', async () => {
      const service = ctx.app.get(CustomersService);
      const incomplete = await loginCustomer(ctx);
      const error = await service.assertCanBook(incomplete.id).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(
        'Add your name and confirm you are 18 or older before booking',
      );

      const ready = await loginReadyCustomer(ctx);
      await expect(service.assertCanBook(ready.id)).resolves.toMatchObject({ id: ready.id });
      await expect(service.getContactCard(ready.id)).resolves.toEqual({
        firstName: 'Asha',
        phone: ready.phone,
      });
    });
  });

  describe('vehicles', () => {
    it('normalises the registration number and makes the first vehicle the default', async () => {
      const customer = await loginCustomer(ctx);
      const first = await api(ctx)
        .post('/customer/vehicles')
        .set(bearer(customer.token))
        .send(VALID_VEHICLE)
        .expect(201);
      expect(first.body).toMatchObject({
        registrationNumber: 'TS09AB1234',
        isDefault: true,
        brand: 'Maruti Suzuki',
      });

      const second = await addVehicle(ctx, customer.token);
      expect(second.isDefault).toBe(false);
    });

    it('requires the insurance date for an insured vehicle', async () => {
      const customer = await loginCustomer(ctx);
      const withoutDate = { ...VALID_VEHICLE, insuranceValidTill: undefined };
      const res = await api(ctx)
        .post('/customer/vehicles')
        .set(bearer(customer.token))
        .send(withoutDate)
        .expect(400);
      const issue = (res.body.issues as { path: unknown; message: string }[]).find(
        (i) => i.message === 'Insurance valid-till date is required for an insured vehicle',
      );
      expect(issue).toBeDefined();
      expect(JSON.stringify(issue?.path)).toContain('insuranceValidTill');
    });

    it('rejects a duplicate registration and reactivates a removed one', async () => {
      const customer = await loginCustomer(ctx);
      const first = await api(ctx)
        .post('/customer/vehicles')
        .set(bearer(customer.token))
        .send(VALID_VEHICLE)
        .expect(201);
      const dup = await api(ctx)
        .post('/customer/vehicles')
        .set(bearer(customer.token))
        .send({ ...VALID_VEHICLE, registrationNumber: 'ts-09-ab-1234' })
        .expect(409);
      expect(dup.body.message).toBe('This vehicle is already in your list');

      await addVehicle(ctx, customer.token);
      await api(ctx)
        .delete(`/customer/vehicles/${first.body.id}`)
        .set(bearer(customer.token))
        .expect(204);
      const again = await api(ctx)
        .post('/customer/vehicles')
        .set(bearer(customer.token))
        .send({ ...VALID_VEHICLE, colour: 'Grey' })
        .expect(201);
      expect(again.body).toMatchObject({ id: first.body.id, colour: 'Grey', isDefault: false });
    });

    it('replaces a vehicle and keeps its default flag', async () => {
      const customer = await loginCustomer(ctx);
      const vehicle = await addVehicle(ctx, customer.token);
      const res = await api(ctx)
        .put(`/customer/vehicles/${vehicle.id}`)
        .set(bearer(customer.token))
        .send({
          ...VALID_VEHICLE,
          registrationNumber: vehicle.registrationNumber,
          colour: 'Red',
          bodyType: 'sedan',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        id: vehicle.id,
        colour: 'Red',
        bodyType: 'sedan',
        isDefault: true,
      });
    });

    it('reassigns the default to the newest active vehicle when the default is removed', async () => {
      const customer = await loginCustomer(ctx);
      const a = await addVehicle(ctx, customer.token);
      const b = await addVehicle(ctx, customer.token);
      const c = await addVehicle(ctx, customer.token);
      await api(ctx).delete(`/customer/vehicles/${a.id}`).set(bearer(customer.token)).expect(204);

      const list = await api(ctx).get('/customer/vehicles').set(bearer(customer.token)).expect(200);
      const rows = list.body as { id: string; isDefault: boolean }[];
      expect(rows.map((v) => v.id)).toEqual([c.id, b.id]);
      expect(rows[0]?.isDefault).toBe(true);
      expect(rows[1]?.isDefault).toBe(false);
    });

    it('sets a different default vehicle', async () => {
      const customer = await loginCustomer(ctx);
      const a = await addVehicle(ctx, customer.token);
      const b = await addVehicle(ctx, customer.token);
      const res = await api(ctx)
        .post(`/customer/vehicles/${b.id}/default`)
        .set(bearer(customer.token))
        .expect(200);
      expect(res.body).toMatchObject({ id: b.id, isDefault: true });

      const list = await api(ctx).get('/customer/vehicles').set(bearer(customer.token)).expect(200);
      const defaults = (list.body as { id: string; isDefault: boolean }[]).filter(
        (v) => v.isDefault,
      );
      expect(defaults.map((v) => v.id)).toEqual([b.id]);
      expect(a.id).not.toBe(b.id);
    });

    it("returns 404 for another customer's vehicle", async () => {
      const owner = await loginCustomer(ctx);
      const other = await loginCustomer(ctx);
      const vehicle = await addVehicle(ctx, owner.token);
      const put = await api(ctx)
        .put(`/customer/vehicles/${vehicle.id}`)
        .set(bearer(other.token))
        .send(VALID_VEHICLE)
        .expect(404);
      expect(put.body.message).toBe('Vehicle not found');
      await api(ctx)
        .delete(`/customer/vehicles/${vehicle.id}`)
        .set(bearer(other.token))
        .expect(404);
      await api(ctx)
        .post(`/customer/vehicles/${vehicle.id}/default`)
        .set(bearer(other.token))
        .expect(404);
      await expect(
        ctx.app.get(CustomersService).getVehicleForBooking(other.id, vehicle.id),
      ).rejects.toThrow('Vehicle not found');
    });

    it('rejects a non-uuid vehicle id with 400', async () => {
      const customer = await loginCustomer(ctx);
      await api(ctx)
        .delete('/customer/vehicles/not-a-uuid')
        .set(bearer(customer.token))
        .expect(400);
    });
  });

  describe('emergency contacts', () => {
    const contact = (n: number) => ({
      name: `Contact ${n}`,
      phone: `98480 0000${n}`,
      relation: 'Sibling',
    });

    it('allows at most three contacts and replaces the whole list', async () => {
      const customer = await loginCustomer(ctx);
      await api(ctx)
        .put('/customer/emergency-contacts')
        .set(bearer(customer.token))
        .send({ contacts: [contact(1), contact(2), contact(3), contact(4)] })
        .expect(400);

      const two = await api(ctx)
        .put('/customer/emergency-contacts')
        .set(bearer(customer.token))
        .send({ contacts: [contact(1), contact(2)] })
        .expect(200);
      expect(two.body.contacts).toHaveLength(2);

      await api(ctx)
        .put('/customer/emergency-contacts')
        .set(bearer(customer.token))
        .send({ contacts: [contact(3)] })
        .expect(200);
      const read = await api(ctx)
        .get('/customer/emergency-contacts')
        .set(bearer(customer.token))
        .expect(200);
      expect(read.body.contacts).toEqual([
        { id: expect.any(String), name: 'Contact 3', phone: '+919848000003', relation: 'Sibling' },
      ]);
    });
  });
});
