import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { REDIS } from '../../src/common/redis.module';
import { configureApp } from '../../src/configure-app';
import { DISPATCH_QUEUE } from '../../src/modules/dispatch/dispatch.constants';

export interface TestContext {
  app: INestApplication;
  ds: DataSource;
  redis: Redis;
  baseUrl: string;
  close(): Promise<void>;
}

const TRANSACTIONAL_TABLES = [
  'notifications',
  'issue_reports',
  'sos_events',
  'audit_logs',
  'trip_photos',
  'booking_events',
  'booking_offers',
  'driver_locations',
  'bookings',
  'driver_sessions',
  'driver_zones',
  'driver_documents',
  'refresh_tokens',
  'devices',
  'consents',
  'emergency_contacts',
  'saved_locations',
  'vehicles',
  'drivers',
  'customers',
];

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  await configureApp(app);
  await app.listen(0, '127.0.0.1');
  const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
  return {
    app,
    ds: app.get(DataSource),
    redis: app.get<Redis>(REDIS),
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      await app.close();
    },
  };
}

async function truncateWithRetry(ctx: TestContext): Promise<void> {
  const sql = `truncate table ${TRANSACTIONAL_TABLES.join(', ')} restart identity`;
  for (let attempt = 0; ; attempt++) {
    try {
      await ctx.ds.query(sql);
      return;
    } catch (error) {
      const deadlock = error instanceof Error && error.message.includes('deadlock detected');
      if (!deadlock || attempt === 2) throw error;
    }
  }
}

export async function resetState(ctx: TestContext): Promise<void> {
  // drop any delayed dispatch round left by the previous test: it would race the truncate below
  const queue = ctx.app.get<Queue>(getQueueToken(DISPATCH_QUEUE), { strict: false });
  await queue.obliterate({ force: true });
  await truncateWithRetry(ctx);
  await ctx.ds.query('delete from admin_users');
  await ctx.ds.query(
    `update dispatch_settings
        set offer_timeout_sec = 1, max_rounds = 2, radius_steps_km = '{3,5}', max_simultaneous_offers = 5`,
  );
  await ctx.ds.query('update pricing_rules set cancellation_grace_sec = 120');
  await ctx.redis.flushdb();
}

export function api(ctx: TestContext) {
  return request(ctx.app.getHttpServer());
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
