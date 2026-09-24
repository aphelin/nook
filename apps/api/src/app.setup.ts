import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { RedisIoAdapter } from './realtime/redis-io.adapter.js';

/** Shared by main.ts and the e2e tests so both boot the exact same HTTP pipeline. */
export function configureApp(app: NestExpressApplication) {
  // One proxy hop (nginx) in front: trust its X-Forwarded-For so rate limits see the real client IP.
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  return app;
}

/** Wires Socket.IO through Redis so every replica shares one set of rooms. */
export async function useRealtime(app: NestExpressApplication, redisUrl: string) {
  const adapter = new RedisIoAdapter(app);
  await adapter.connect(redisUrl);
  app.useWebSocketAdapter(adapter);
  return app;
}
