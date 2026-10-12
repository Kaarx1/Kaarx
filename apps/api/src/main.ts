import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env } from './config/env';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  if (env.PROCESS_ROLE === 'worker') {
    const context = await NestFactory.createApplicationContext(AppModule);
    context.enableShutdownHooks();
    logger.log('Worker started (no HTTP server)');
    return;
  }
  const app = await NestFactory.create(AppModule);
  await configureApp(app);
  await app.listen(env.PORT, '0.0.0.0');
  logger.log(`API listening on port ${env.PORT} (PROCESS_ROLE=${env.PROCESS_ROLE})`);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
