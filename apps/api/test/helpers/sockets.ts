import { REALTIME_EVENTS } from '@kaarx/shared';
import { io, type Socket } from 'socket.io-client';
import type { TestContext } from './test-app';

const openSockets = new Set<Socket>();

export function connectSocket(ctx: TestContext, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(ctx.baseUrl, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    openSockets.add(socket);
    const fail = (error: Error): void => {
      clearTimeout(timer);
      socket.close();
      openSockets.delete(socket);
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error('Timed out waiting for socket ready')), 8000);
    socket.once(REALTIME_EVENTS.ready, () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once(REALTIME_EVENTS.authError, (payload: { message: string }) =>
      fail(new Error(payload.message)),
    );
    socket.once('connect_error', (error: Error) => fail(error));
  });
}

export function nextEvent<T>(
  socket: Socket,
  event: string,
  predicate: (payload: T) => boolean = () => true,
  timeoutMs = 8000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const handler = (payload: T): void => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    socket.on(event, handler);
  });
}

export function collectEvents<T>(socket: Socket, event: string): { events: T[]; stop(): void } {
  const events: T[] = [];
  const handler = (payload: T): void => {
    events.push(payload);
  };
  socket.on(event, handler);
  return { events, stop: () => socket.off(event, handler) };
}

export function closeAllSockets(): void {
  for (const socket of openSockets) socket.close();
  openSockets.clear();
}
