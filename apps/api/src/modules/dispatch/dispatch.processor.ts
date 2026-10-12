import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { DISPATCH_QUEUE, DISPATCH_ROUND_JOB, type DispatchJobData } from './dispatch.constants';
import { DispatchRoundService } from './dispatch-round.service';

@Processor(DISPATCH_QUEUE, { concurrency: 5 })
export class DispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(DispatchProcessor.name);

  constructor(private readonly rounds: DispatchRoundService) {
    super();
  }

  async process(job: Job<DispatchJobData>): Promise<void> {
    if (job.name !== DISPATCH_ROUND_JOB) {
      this.logger.warn(`Ignoring unknown dispatch job ${job.name}`);
      return;
    }
    await this.rounds.runRound(job.data.bookingId, job.data.round);
  }
}
