import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Session } from '@nook/contracts';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

let app: NestExpressApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService;

const run = Date.now().toString(36);
const account = (tag: string) => ({
  email: `${tag}-${run}@example.test`,
  handle: `${tag}_${run}`.slice(0, 24),
  displayName: `Test ${tag}`,
  password: 'correct horse battery',
});

/** Moves a token's rotation time outside the reuse grace window, as if a minute had passed. */
async function ageRotation(rawToken: string) {
  const { createHash } = await import('node:crypto');
  await prisma.refreshToken.update({
    where: { tokenHash: createHash('sha256').update(rawToken).digest('hex') },
    data: { revokedAt: new Date(Date.now() - 60_000) },
  });
}

/** Pulls a cookie value out of Set-Cookie headers. */
function cookie(res: request.Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const line = raw?.find((c) => c.startsWith(`${name}=`));
  return line?.split(';')[0]?.slice(name.length + 1);
}

beforeAll(async () => {
  const redis = new Redis(process.env.REDIS_URL!);
  await redis.flushdb();
  await redis.quit();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(moduleRef.createNestApplication<NestExpressApplication>());
  await app.init();
  http = request(app.getHttpServer());
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app?.close();
});

describe('register', () => {
  it('creates an account, returns a session, and sets both cookies', async () => {
    const res = await http.post('/api/auth/register').send(account('reg')).expect(201);
    const session = Session.parse(res.body);
    expect(session.user.handle).toBe(account('reg').handle);
    expect(session.expiresIn).toBe(900);
    expect(res.body).not.toHaveProperty('refresh');
    const setCookie = (res.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(setCookie).toMatch(/nook_rt=[^;]+; Path=\/api\/auth; Expires=[^;]+; HttpOnly; SameSite=Lax/);
    expect(setCookie).toMatch(/nook_session=1; Path=\/;/);
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: account('reg').email } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('rejects a duplicate email with 409', async () => {
    const res = await http.post('/api/auth/register').send({ ...account('reg'), handle: `other_${run}`.slice(0, 24) }).expect(409);
    expect(res.body.message).toMatch(/already exists/);
  });

  it('rejects a taken handle with 409', async () => {
    const res = await http.post('/api/auth/register').send({ ...account('reg'), email: `x-${run}@example.test` }).expect(409);
    expect(res.body.message).toMatch(/handle is taken/);
  });

  it('returns field issues for invalid input', async () => {
    const res = await http.post('/api/auth/register').send({ email: 'nope', handle: 'Bad Handle', displayName: '', password: 'short' }).expect(400);
    const paths = (res.body.issues as { path: string }[]).map((i) => i.path).sort();
    expect(paths).toEqual(['displayName', 'email', 'handle', 'password']);
  });
});

describe('login and me', () => {
  it('logs in and reads the profile with the access token', async () => {
    const acct = account('login');
    await http.post('/api/auth/register').send(acct).expect(201);
    const res = await http.post('/api/auth/login').send({ email: acct.email.toUpperCase(), password: acct.password }).expect(200);
    const me = await http.get('/api/users/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
    expect(me.body.handle).toBe(acct.handle);
  });

  it('rejects a wrong password with a generic 401', async () => {
    const res = await http.post('/api/auth/login').send({ email: account('login').email, password: 'wrong password' }).expect(401);
    expect(res.body.message).toBe('That email and password don’t match.');
  });

  it('gives an unknown email the same 401 as a wrong password', async () => {
    const res = await http.post('/api/auth/login').send({ email: `ghost-${run}@example.test`, password: 'whatever1' }).expect(401);
    expect(res.body.message).toBe('That email and password don’t match.');
  });

  it('guards protected routes', async () => {
    await http.get('/api/users/me').expect(401);
    await http.get('/api/users/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
  });
});

describe('refresh rotation', () => {
  it('rotates the refresh token and revokes the whole family when an old one is reused', async () => {
    const reg = await http.post('/api/auth/register').send(account('rot')).expect(201);
    const first = cookie(reg, 'nook_rt')!;

    const r1 = await http.post('/api/auth/refresh').set('Cookie', `nook_rt=${first}`).expect(200);
    const second = cookie(r1, 'nook_rt')!;
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    await http.get('/api/users/me').set('Authorization', `Bearer ${r1.body.accessToken}`).expect(200);

    // Time passes beyond the grace window, then an attacker replays the first (already rotated) token.
    await ageRotation(first);
    const replay = await http.post('/api/auth/refresh').set('Cookie', `nook_rt=${first}`).expect(401);
    expect(replay.body.message).toMatch(/signed out for your safety/);

    // The legitimate holder's newer token is now dead too.
    await http.post('/api/auth/refresh').set('Cookie', `nook_rt=${second}`).expect(401);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: account('rot').email } });
    const live = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
    expect(live).toBe(0);
  });

  it('recovers a refresh whose response was lost, within the grace window', async () => {
    const reg = await http.post('/api/auth/register').send(account('lost')).expect(201);
    const first = cookie(reg, 'nook_rt')!;
    // The browser sent this refresh but navigated away before the new cookie arrived.
    const lostResponse = await http.post('/api/auth/refresh').set('Cookie', `nook_rt=${first}`).expect(200);
    const neverReceived = cookie(lostResponse, 'nook_rt')!;

    // Next page load presents the old token again: still signed in, with a fresh token.
    const retry = await http.post('/api/auth/refresh').set('Cookie', `nook_rt=${first}`).expect(200);
    const fresh = cookie(retry, 'nook_rt')!;
    expect(fresh).not.toBe(neverReceived);
    await http.post('/api/auth/refresh').set('Cookie', `nook_rt=${fresh}`).expect(200);

    // The replacement that was never delivered can no longer be used on its own.
    await ageRotation(neverReceived);
    await http.post('/api/auth/refresh').set('Cookie', `nook_rt=${neverReceived}`).expect(401);
  });

  it('does not recover once the replacement has been used', async () => {
    const reg = await http.post('/api/auth/register').send(account('stolen')).expect(201);
    const first = cookie(reg, 'nook_rt')!;
    const r1 = await http.post('/api/auth/refresh').set('Cookie', `nook_rt=${first}`).expect(200);
    await http.post('/api/auth/refresh').set('Cookie', `nook_rt=${cookie(r1, 'nook_rt')}`).expect(200);
    // Within the window, but the replacement already moved on: this is a replay, not a lost response.
    await http.post('/api/auth/refresh').set('Cookie', `nook_rt=${first}`).expect(401);
  });

  it('links each rotated token to its replacement', async () => {
    const reg = await http.post('/api/auth/register').send(account('link')).expect(201);
    await http.post('/api/auth/refresh').set('Cookie', `nook_rt=${cookie(reg, 'nook_rt')}`).expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: account('link').email } });
    const tokens = await prisma.refreshToken.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
    expect(tokens).toHaveLength(2);
    expect(tokens[0]!.replacedById).toBe(tokens[1]!.id);
    expect(tokens[0]!.familyId).toBe(tokens[1]!.familyId);
  });

  it('rejects refresh without a cookie', async () => {
    await http.post('/api/auth/refresh').expect(401);
  });
});

describe('logout', () => {
  it('revokes the session and clears cookies', async () => {
    const reg = await http.post('/api/auth/register').send(account('out')).expect(201);
    const rt = cookie(reg, 'nook_rt')!;
    const out = await http.post('/api/auth/logout').set('Cookie', `nook_rt=${rt}`).expect(204);
    expect((out.headers['set-cookie'] as unknown as string[]).join('\n')).toMatch(/nook_rt=; Path=\/api\/auth; Expires=Thu, 01 Jan 1970/);
    await http.post('/api/auth/refresh').set('Cookie', `nook_rt=${rt}`).expect(401);
  });
});

describe('rate limiting', () => {
  it('blocks the 11th login attempt for one email within a minute', async () => {
    const email = `limited-${run}@example.test`;
    for (let i = 0; i < 10; i++) await http.post('/api/auth/login').send({ email, password: 'wrongpass1' }).expect(401);
    const res = await http.post('/api/auth/login').send({ email, password: 'wrongpass1' }).expect(429);
    expect(res.body.message).toMatch(/Too many attempts/);
  });
});
