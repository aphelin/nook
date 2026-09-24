import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Session } from '@nook/contracts';
import { Redis } from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp, useRealtime } from '../src/app.setup.js';

export async function flushRedis() {
  const redis = new Redis(process.env.REDIS_URL!);
  await redis.flushdb();
  await redis.quit();
}

/** Boots a full api instance (HTTP + Socket.IO over Redis) on a random port. */
export async function bootApp({ flush = true } = {}) {
  if (flush) await flushRedis();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>());
  await useRealtime(app, process.env.REDIS_URL!);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as { port: number };
  return { app, http: request(app.getHttpServer()), url: `http://127.0.0.1:${address.port}` };
}

export type Http = ReturnType<typeof request>;

export interface TestUser {
  token: string;
  id: string;
  handle: string;
  auth: { Authorization: string };
}

const run = Date.now().toString(36);
let seq = 0;

/** Registers a fresh user and returns their bearer credentials. */
export async function registerUser(http: Http, tag: string): Promise<TestUser> {
  const n = ++seq;
  const handle = `${tag}${n}_${run}`.slice(0, 24);
  const res = await http
    .post('/api/auth/register')
    .send({ email: `${handle}@example.test`, handle, displayName: `${tag} ${n}`, password: 'correct horse battery' })
    .expect(201);
  const session = Session.parse(res.body);
  return { token: session.accessToken, id: session.user.id, handle, auth: { Authorization: `Bearer ${session.accessToken}` } };
}

export const uniqueSlug = (tag: string) => `${tag}-${run}-${++seq}`.slice(0, 32);
