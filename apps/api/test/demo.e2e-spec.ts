import type { NestExpressApplication } from '@nestjs/platform-express';
import { PublicUser, Session } from '@nook/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { bootApp, registerUser } from './helpers.js';

// The env is read when the app boots, so each case boots its own app with its own settings.
let app: NestExpressApplication | undefined;
const saved = { DEMO_LOGIN: process.env.DEMO_LOGIN, DEMO_EMAIL: process.env.DEMO_EMAIL };

async function bootWith(env: { DEMO_LOGIN?: string; DEMO_EMAIL?: string }) {
  process.env.DEMO_LOGIN = env.DEMO_LOGIN;
  process.env.DEMO_EMAIL = env.DEMO_EMAIL;
  if (env.DEMO_LOGIN === undefined) delete process.env.DEMO_LOGIN;
  if (env.DEMO_EMAIL === undefined) delete process.env.DEMO_EMAIL;
  const booted = await bootApp();
  app = booted.app;
  return booted.http;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('demo sign-in', () => {
  it('does not exist unless enabled', async () => {
    const http = await bootWith({});
    await http.post('/api/auth/demo').expect(404);
  });

  it('answers 404 when the demo account was never seeded', async () => {
    const http = await bootWith({ DEMO_LOGIN: 'true', DEMO_EMAIL: `nobody-${Date.now()}@nook.demo` });
    await http.post('/api/auth/demo').expect(404);
  });

  it('signs in as the demo member only, with a working session and refresh cookie', async () => {
    // Register the "demo member" through a first app, then boot one that points the demo at it.
    const setup = await bootWith({});
    const demoUser = await registerUser(setup, 'demomara');
    const other = await registerUser(setup, 'someoneelse');
    await app!.close();
    app = undefined;

    const http = await bootWith({ DEMO_LOGIN: 'true', DEMO_EMAIL: `${demoUser.handle}@example.test` });
    // Whatever the body says, it's always the demo account.
    const res = await http.post('/api/auth/demo').send({ email: `${other.handle}@example.test` }).expect(200);
    const session = Session.parse(res.body);
    expect(session.user.id).toBe(demoUser.id);
    expect(String(res.headers['set-cookie'])).toMatch(/nook_rt=/);
    const me = PublicUser.parse((await http.get('/api/users/me').set({ Authorization: `Bearer ${session.accessToken}` }).expect(200)).body);
    expect(me.id).toBe(demoUser.id);
  });

  it('is rate limited per address', async () => {
    const setup = await bootWith({});
    const demoUser = await registerUser(setup, 'demolimit');
    await app!.close();
    app = undefined;
    const http = await bootWith({ DEMO_LOGIN: 'true', DEMO_EMAIL: `${demoUser.handle}@example.test` });
    for (let i = 0; i < 20; i++) await http.post('/api/auth/demo').expect(200);
    await http.post('/api/auth/demo').expect(429);
  });
});
