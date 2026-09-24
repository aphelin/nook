import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp, useRealtime } from './app.setup.js';
import { ENV, type Env } from './config/env.js';

async function bootstrap() {
  const app = configureApp(await NestFactory.create<NestExpressApplication>(AppModule));
  const env = app.get<Env>(ENV);
  await useRealtime(app, env.REDIS_URL);
  await app.listen(env.PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`api ${env.INSTANCE_ID} listening on :${env.PORT}`);
}
await bootstrap();
