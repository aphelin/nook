import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

const env = { INSTANCE_ID: 'api-test' } as Env;
const redisUp = { ping: async () => 'PONG' } as never;
const prisma = (ok: boolean) =>
  ({ $queryRaw: () => (ok ? Promise.resolve([{ '?column?': 1 }]) : Promise.reject(new Error('down'))) }) as unknown as PrismaService;

describe('HealthController', () => {
  it('reports ok with the instance id when dependencies are up', async () => {
    const res = await new HealthController(prisma(true), redisUp, env).check();
    expect(res).toEqual({ status: 'ok', instance: 'api-test', checks: { database: 'up', redis: 'up' } });
  });

  it('returns 503 when the database is down', async () => {
    await expect(new HealthController(prisma(false), redisUp, env).check()).rejects.toBeInstanceOf(HttpException);
  });
});
