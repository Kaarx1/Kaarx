import { REALTIME_EVENTS } from '@kaarx/shared';
import { io } from 'socket.io-client';
import { RealtimePublisher } from '../src/modules/realtime/realtime.publisher';
import { loginAdmin, loginCustomer } from './helpers/factories';
import { closeAllSockets, collectEvents, connectSocket, nextEvent } from './helpers/sockets';
import { createTestApp, resetState, type TestContext } from './helpers/test-app';

describe('realtime gateway', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    closeAllSockets();
    await ctx.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
  });
  afterEach(() => closeAllSockets());

  it('rejects a bad token with auth_error', async () => {
    await expect(connectSocket(ctx, 'not-a-jwt')).rejects.toThrow(
      'Your session has expired. Sign in again.',
    );
  });

  it('sends ready with the role to an admin', async () => {
    const { token } = await loginAdmin(ctx);
    const socket = io(ctx.baseUrl, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    try {
      await expect(nextEvent<{ role: string }>(socket, REALTIME_EVENTS.ready)).resolves.toEqual({
        role: 'admin',
      });
    } finally {
      socket.close();
    }
  });

  it('publisher reaches only the addressed rooms', async () => {
    const a = await loginCustomer(ctx);
    const b = await loginCustomer(ctx);
    const admin = await loginAdmin(ctx);
    const [socketA, socketB, adminSocket] = await Promise.all([
      connectSocket(ctx, a.token),
      connectSocket(ctx, b.token),
      connectSocket(ctx, admin.token),
    ]);
    const missed = collectEvents<unknown>(socketB, REALTIME_EVENTS.bookingUpdated);
    const toA = nextEvent<{ ping: number }>(socketA, REALTIME_EVENTS.bookingUpdated);
    const toAdmins = nextEvent<{ id: string }>(adminSocket, REALTIME_EVENTS.sosRaised);

    const publisher = ctx.app.get(RealtimePublisher);
    publisher.toCustomer(a.id, REALTIME_EVENTS.bookingUpdated, { ping: 1 });
    publisher.toAdmins(REALTIME_EVENTS.sosRaised, { id: 'sos-1' });

    await expect(toA).resolves.toEqual({ ping: 1 });
    await expect(toAdmins).resolves.toEqual({ id: 'sos-1' });
    missed.stop();
    expect(missed.events).toHaveLength(0);
  });
});
