import { Inject, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { Emitter } from '@socket.io/redis-emitter';
import { type Job, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { ConfigModule } from './config/config.module.js';
import { ENV, type Env } from './config/env.js';
import { MessageHydrator } from './messages/hydrator.js';
import { MessagesService } from './messages/messages.service.js';
import { NotificationsService } from './notifications/notifications.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import type { JobName, JobPayloads } from './queue/jobs.service.js';
import { JobsService } from './queue/jobs.service.js';
import { QueueModule } from './queue/queue.module.js';
import { QUEUES, WORKER_HEARTBEAT_KEY, WORKER_HEARTBEAT_TTL_S } from './queue/queues.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { RealtimeService } from './realtime/realtime.service.js';
import { REDIS, RedisModule } from './redis/redis.module.js';
import { StorageModule } from './storage/storage.module.js';
import { UnfurlService } from './unfurl/unfurl.service.js';
import { UploadsService } from './uploads/uploads.service.js';
import { UsersService } from './users/users.service.js';
import { ThumbnailProcessor } from './worker/thumbnails.js';

/**
 * Background worker process. Same codebase as the api, different entrypoint.
 * It has no sockets of its own: live updates go out through a Redis emitter.
 */
@Module({
  imports: [ConfigModule, PrismaModule, RedisModule, RealtimeModule, StorageModule, QueueModule],
  providers: [MessagesService, MessageHydrator, NotificationsService, UploadsService, UsersService, UnfurlService, ThumbnailProcessor],
})
export class WorkerModule implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Worker');
  private worker?: Worker;
  private heartbeat?: NodeJS.Timeout;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
    private readonly realtime: RealtimeService,
    private readonly jobs: JobsService,
    private readonly thumbnails: ThumbnailProcessor,
    private readonly unfurl: UnfurlService,
    private readonly uploads: UploadsService,
    private readonly users: UsersService,
  ) {}

  async onApplicationBootstrap() {
    this.realtime.bind(new Emitter(this.redis.duplicate()));

    const handlers: { [N in JobName]: (data: JobPayloads[N]) => Promise<unknown> } = {
      thumbnail: ({ attachmentId }) => this.thumbnails.process(attachmentId),
      unfurl: ({ messageId }) => this.unfurl.unfurlMessage(messageId),
      'cleanup-uploads': async () => ({ attachments: await this.uploads.cleanupStale(), avatars: await this.users.cleanupAbandonedAvatars() }),
    };
    this.worker = new Worker(
      QUEUES.jobs,
      async (job: Job) => {
        const handler = handlers[job.name as JobName] as ((data: unknown) => Promise<unknown>) | undefined;
        if (!handler) throw new Error(`No processor for job "${job.name}"`);
        return handler(job.data);
      },
      { connection: this.redis.duplicate(), concurrency: 4 },
    );
    this.worker.on('failed', (job, err) => this.logger.warn(`${job?.name} ${job?.id} failed: ${err.message}`));
    await this.jobs.repeat('cleanup-uploads', {}, 3_600_000);

    const beat = () =>
      this.redis.set(WORKER_HEARTBEAT_KEY, this.env.INSTANCE_ID, 'EX', WORKER_HEARTBEAT_TTL_S).catch((err: unknown) => {
        this.logger.error(`Heartbeat failed: ${String(err)}`);
      });
    await beat();
    this.heartbeat = setInterval(() => void beat(), (WORKER_HEARTBEAT_TTL_S / 3) * 1000);
    this.logger.log(`worker ${this.env.INSTANCE_ID} consuming "${QUEUES.jobs}"`);
  }

  async onApplicationShutdown() {
    clearInterval(this.heartbeat);
    await this.worker?.close();
  }
}
