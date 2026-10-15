import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { REDIS } from '../../../common/redis.module';
import { Public } from '../../../common/auth/decorators';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async check(): Promise<{ status: 'ok'; db: 'up'; redis: 'up' }> {
    const [db, redis] = await Promise.all([
      this.probe(() => this.dataSource.query('select 1')),
      this.probe(() => this.redis.ping()),
    ]);
    if (!db || !redis) {
      throw new ServiceUnavailableException({
        status: 'degraded',
        db: db ? 'up' : 'down',
        redis: redis ? 'up' : 'down',
      });
    }
    return { status: 'ok', db: 'up', redis: 'up' };
  }

  private async probe(check: () => Promise<unknown>): Promise<boolean> {
    try {
      await check();
      return true;
    } catch {
      return false;
    }
  }
}
