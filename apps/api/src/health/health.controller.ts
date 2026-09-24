import { Controller, Get, HttpException, HttpStatus, Inject } from '@nestjs/common';
import type { Health } from '@nook/contracts';
import { Redis } from 'ioredis';
import { Public } from '../auth/public.decorator.js';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  async check(): Promise<Health> {
    const [database, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(
        () => 'up' as const,
        () => 'down' as const,
      ),
      this.redis.ping().then(
        () => 'up' as const,
        () => 'down' as const,
      ),
    ]);
    const checks = { database, redis };
    if (database === 'down' || redis === 'down') {
      throw new HttpException({ status: 'down', instance: this.env.INSTANCE_ID, checks }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: 'ok', instance: this.env.INSTANCE_ID, checks };
  }
}
