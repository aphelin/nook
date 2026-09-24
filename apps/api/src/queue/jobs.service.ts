import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';
import { QUEUES } from './queues.js';

export type JobPayloads = {
  thumbnail: { attachmentId: string };
  unfurl: { messageId: string };
  'cleanup-uploads': Record<string, never>;
};
export type JobName = keyof JobPayloads;

/** The producer side of the background queue; the worker process consumes it. */
@Injectable()
export class JobsService implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(@Inject(REDIS) redis: Redis) {
    this.queue = new Queue(QUEUES.jobs, {
      connection: redis.duplicate(),
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 1000, removeOnFail: 5000 },
    });
  }

  async enqueue<N extends JobName>(name: N, data: JobPayloads[N], jobId?: string) {
    await this.queue.add(name, data, jobId ? { jobId } : undefined);
  }

  /** Registers a repeating job; idempotent across restarts and replicas. */
  async repeat<N extends JobName>(name: N, data: JobPayloads[N], everyMs: number) {
    await this.queue.upsertJobScheduler(`${name}-schedule`, { every: everyMs }, { name, data });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
