import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  DISPATCH_QUEUE,
  DISPATCH_ROUND_JOB,
  roundJobId,
  type DispatchJobData,
} from './dispatch.constants';

@Injectable()
export class DispatchService {
  constructor(@InjectQueue(DISPATCH_QUEUE) private readonly queue: Queue<DispatchJobData>) {}

  async scheduleRound(bookingId: string, round: number, delayMs = 0): Promise<void> {
    await this.queue.add(
      DISPATCH_ROUND_JOB,
      { bookingId, round },
      {
        jobId: roundJobId(bookingId, round),
        delay: delayMs,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  async promoteRound(bookingId: string, round: number): Promise<void> {
    const job = await this.queue.getJob(roundJobId(bookingId, round));
    if (job && (await job.isDelayed())) await job.promote().catch(() => undefined);
  }

  async removeRound(bookingId: string, round: number): Promise<void> {
    const job = await this.queue.getJob(roundJobId(bookingId, round));
    if (job) await job.remove().catch(() => undefined);
  }

  async restart(bookingId: string, previousRound: number): Promise<void> {
    await this.removeRound(bookingId, previousRound + 1);
    await this.removeRound(bookingId, 1);
    await this.scheduleRound(bookingId, 1);
  }
}
