import type { INestApplication } from '@nestjs/common';
import { env } from './config/env';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';

export async function configureApp(app: INestApplication): Promise<void> {
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.enableShutdownHooks();
  const ioAdapter = new RedisIoAdapter(app);
  await ioAdapter.connect(env.REDIS_URL);
  app.useWebSocketAdapter(ioAdapter);
}
