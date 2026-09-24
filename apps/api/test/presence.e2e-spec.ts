import type { NestExpressApplication } from '@nestjs/platform-express';
import { PresenceSnapshot } from '@nook/contracts';
import { Redis } from 'ioredis';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PresenceService } from '../src/presence/presence.service.js';
import { bootApp, type Http, registerUser, type TestUser, uniqueSlug } from './helpers.js';
import { closeAll, collect, connect, nextEvent } from './sockets.js';

type PresenceEvent = { userId: string; state: string };

let appA: NestExpressApplication;
let appB: NestExpressApplication;
let httpA: Http;
let httpB: Http;
let urlA: string;
let urlB: string;
let alice: TestUser;
let bob: TestUser;
let outsider: TestUser;
let slug: string;
let generalId: string;
let watcher: Socket;

const about = (u: TestUser, state: string) => (e: PresenceEvent) => e.userId === u.id && e.state === state;

beforeAll(async () => {
  ({ app: appA, http: httpA, url: urlA } = await bootApp());
  ({ app: appB, http: httpB, url: urlB } = await bootApp({ flush: false }));
  [alice, bob, outsider] = await Promise.all([registerUser(httpA, 'alice'), registerUser(httpA, 'bob'), registerUser(httpA, 'outsider')]);
  slug = uniqueSlug('presence');
  const created = await httpA.post('/api/nooks').set(bob.auth).send({ name: 'Presence Club', slug, kit: { field: '#1f4e79', mark: '#f28c28' } }).expect(201);
  generalId = (created.body.channels as { id: string; name: string }[]).find((c) => c.name === 'general')!.id;
  const code = (await httpA.post(`/api/nooks/${slug}/invites`).set(bob.auth).send({}).expect(201)).body.code as string;
  await httpA.post(`/api/invites/${code}/accept`).set(alice.auth).expect(200);
  // Bob watches from instance B; Alice comes and goes on instance A.
  watcher = await connect(urlB, bob.token);
});

afterAll(async () => {
  closeAll();
  await appA?.close();
  await appB?.close();
});

describe('presence', () => {
  it('announces coming online and going offline across instances', async () => {
    const online = nextEvent<PresenceEvent>(watcher, 'presence', about(alice, 'online'));
    const tab = await connect(urlA, alice.token);
    await online;
    const offline = nextEvent<PresenceEvent>(watcher, 'presence', about(alice, 'offline'));
    tab.disconnect();
    await offline;
  });

  it('stays online while any tab is open, and only announces real changes', async () => {
    const events = collect<PresenceEvent>(watcher, 'presence', (e) => e.userId === alice.id, 1200);
    const tab1 = await connect(urlA, alice.token);
    const tab2 = await connect(urlB, alice.token);
    tab1.disconnect();
    await new Promise((r) => setTimeout(r, 300));
    expect((await PresenceSnapshot.parseAsync((await httpA.get(`/api/nooks/${slug}/presence`).set(bob.auth)).body))[alice.id]).toBe('online');
    tab2.disconnect();
    // Online once (second tab changes nothing), offline once (first close changes nothing).
    expect((await events).map((e) => e.state)).toEqual(['online', 'offline']);
  });

  it('goes away when every tab is idle, and back when one wakes', async () => {
    const online = nextEvent<PresenceEvent>(watcher, 'presence', about(alice, 'online'));
    const tab = await connect(urlA, alice.token);
    await online;
    const away = nextEvent<PresenceEvent>(watcher, 'presence', about(alice, 'away'));
    tab.emit('presence:idle', { idle: true });
    await away;
    const back = nextEvent<PresenceEvent>(watcher, 'presence', about(alice, 'online'));
    tab.emit('presence:idle', { idle: false });
    await back;
    tab.disconnect();
    await nextEvent<PresenceEvent>(watcher, 'presence', about(alice, 'offline'));
  });

  it('honours a chosen do-not-disturb until cleared', async () => {
    // Listen before connecting: "online" is announced before the tab's own ready event.
    const online = nextEvent<PresenceEvent>(watcher, 'presence', about(alice, 'online'));
    const tab = await connect(urlA, alice.token);
    await online;
    const dnd = nextEvent<PresenceEvent>(watcher, 'presence', about(alice, 'dnd'));
    expect(await tab.timeout(2000).emitWithAck('presence:set', { state: 'dnd' })).toEqual({ ok: true, data: null });
    await dnd;
    expect(await tab.timeout(2000).emitWithAck('presence:set', { state: 'invisible' })).toEqual({ ok: false, error: 'Unknown status' });
    const cleared = nextEvent<PresenceEvent>(watcher, 'presence', about(alice, 'online'));
    await tab.timeout(2000).emitWithAck('presence:set', { state: 'online' });
    await cleared;
    tab.disconnect();
    await nextEvent<PresenceEvent>(watcher, 'presence', about(alice, 'offline'));
  });

  it('sweeps people whose replica died without saying goodbye', async () => {
    const online = nextEvent<PresenceEvent>(watcher, 'presence', about(alice, 'online'));
    const tab = await connect(urlA, alice.token);
    await online;
    // Simulate a crash: stop the socket from telling the server, then let its lease lapse.
    const redis = new Redis(process.env.REDIS_URL!);
    const past = Date.now() - 1000;
    await redis.zadd(`presence:conn:${alice.id}`, past, tab.id!);
    await redis.zadd('presence:users', past, alice.id);
    await redis.quit();
    const offline = nextEvent<PresenceEvent>(watcher, 'presence', about(alice, 'offline'));
    expect(await appB.get(PresenceService).sweep()).toBeGreaterThanOrEqual(1);
    await offline;
    tab.disconnect();
  });

  it('serves a snapshot to members only', async () => {
    const snap = PresenceSnapshot.parse((await httpB.get(`/api/nooks/${slug}/presence`).set(bob.auth).expect(200)).body);
    expect(snap[bob.id]).toBe('online');
    expect(snap[alice.id]).toBe('offline');
    await httpA.get(`/api/nooks/${slug}/presence`).set(outsider.auth).expect(404);
  });
});

describe('typing', () => {
  it('relays typing to other members across instances, throttled, never echoed, never to outsiders', async () => {
    const tab = await connect(urlA, alice.token);
    const outsiderTab = await connect(urlA, outsider.token);
    const toBob = collect<{ channelId: string; userId: string }>(watcher, 'typing', (e) => e.userId === alice.id, 600);
    const toAlice = collect(tab, 'typing', () => true, 600);
    const toOutsider = collect(outsiderTab, 'typing', () => true, 600);
    tab.emit('typing:start', { channelId: generalId });
    tab.emit('typing:start', { channelId: generalId }); // within the throttle window
    outsiderTab.emit('typing:start', { channelId: generalId }); // not a member: dropped
    expect(await toBob).toEqual([{ channelId: generalId, userId: alice.id }]);
    expect(await toAlice).toEqual([]);
    expect(await toOutsider).toEqual([]);
  });
});
