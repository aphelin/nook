import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { type Ack, Message, SearchResults } from '@nook/contracts';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, type Http, registerUser, type TestUser, uniqueSlug } from './helpers.js';
import { closeAll, connect } from './sockets.js';

let app: NestExpressApplication;
let http: Http;
let url: string;
let alice: TestUser;
let bob: TestUser;
let slug: string;
let otherSlug: string;
let generalId: string;
let gearId: string;
let secretId: string;
let aliceSocket: Socket;
let bobSocket: Socket;
// Every body carries this run's marker word, so parallel suites and earlier runs never match.
const tag = `zq${Date.now().toString(36)}`;

const sent = async (socket: Socket, channelId: string, body: string, threadRootId: string | null = null) => {
  const ack = (await socket.timeout(3000).emitWithAck('message:send', { clientId: randomUUID(), channelId, body, threadRootId })) as Ack<Message>;
  if (!ack.ok) throw new Error(ack.error);
  return ack.data;
};
const search = async (user: TestUser, q: string, extra: Record<string, string | number> = {}) =>
  SearchResults.parse((await http.get('/api/search').query({ q, nook: slug, ...extra }).set(user.auth).expect(200)).body);
const bodies = (r: SearchResults) => r.items.map((i) => i.message.body);

beforeAll(async () => {
  ({ app, http, url } = await bootApp());
  [alice, bob] = await Promise.all([registerUser(http, 'alice'), registerUser(http, 'bob')]);
  slug = uniqueSlug('search');
  const created = await http.post('/api/nooks').set(alice.auth).send({ name: 'Search', slug, kit: { field: '#1f4e79', mark: '#f28c28' } }).expect(201);
  generalId = (created.body.channels as { id: string; name: string }[]).find((c) => c.name === 'general')!.id;
  gearId = (await http.post(`/api/nooks/${slug}/channels`).set(alice.auth).send({ name: 'gear' }).expect(201)).body.id as string;
  secretId = (await http.post(`/api/nooks/${slug}/channels`).set(alice.auth).send({ name: 'secret', kind: 'private' }).expect(201)).body.id as string;
  const code = (await http.post(`/api/nooks/${slug}/invites`).set(alice.auth).send({}).expect(201)).body.code as string;
  await http.post(`/api/invites/${code}/accept`).set(bob.auth).expect(200);
  otherSlug = uniqueSlug('elsewhere');
  await http.post('/api/nooks').set(bob.auth).send({ name: 'Elsewhere', slug: otherSlug, kit: { field: '#7a1f2b', mark: '#e8c872' } }).expect(201);
  aliceSocket = await connect(url, alice.token);
  bobSocket = await connect(url, bob.token);
});

afterAll(async () => {
  closeAll();
  await app?.close();
});

describe('search', () => {
  it('finds words and prefixes case-insensitively, newest first, in pages', async () => {
    const first = await sent(aliceSocket, generalId, `${tag} Climbing at the Crag tonight`);
    const second = await sent(bobSocket, gearId, `${tag} new climbing shoes`);
    await sent(bobSocket, gearId, `${tag} unrelated noodles`);
    const third = await sent(aliceSocket, generalId, `${tag} CLIMB harder`);

    const hits = await search(bob, `${tag} clim`);
    expect(hits.items.map((i) => i.message.id)).toEqual([third.id, second.id, first.id]);
    expect(hits.items[1]).toMatchObject({ channel: { id: gearId, name: 'gear', kind: 'public' }, nook: { slug } });

    const page1 = await search(bob, `${tag} clim`, { limit: 2 });
    expect(page1.items.map((i) => i.message.id)).toEqual([third.id, second.id]);
    const page2 = await search(bob, `${tag} clim`, { limit: 2, before: page1.nextCursor! });
    expect(page2.items.map((i) => i.message.id)).toEqual([first.id]);
    expect(page2.nextCursor).toBeNull();
  });

  it('only searches channels you are in: private channels and other nooks stay out', async () => {
    await sent(aliceSocket, secretId, `${tag} secretplan in the private channel`);
    expect(bodies(await search(alice, `${tag} secretplan`))).toHaveLength(1);
    expect(bodies(await search(bob, `${tag} secretplan`))).toEqual([]);

    const bobElsewhere = await connect(url, bob.token);
    const elsewhere = (await http.get(`/api/nooks/${otherSlug}`).set(bob.auth).expect(200)).body.channels[0].id as string;
    await sent(bobElsewhere, elsewhere, `${tag} farawayword`);
    // Scoped to this nook, Bob's other nook is left out; without the scope it's found.
    expect(bodies(await search(bob, `${tag} farawayword`))).toEqual([]);
    const all = SearchResults.parse((await http.get('/api/search').query({ q: `${tag} farawayword` }).set(bob.auth).expect(200)).body);
    expect(all.items.map((i) => i.nook.slug)).toEqual([otherSlug]);
    // And Alice, who isn't in that nook, can't find it anywhere.
    const alices = SearchResults.parse((await http.get('/api/search').query({ q: `${tag} farawayword` }).set(alice.auth).expect(200)).body);
    expect(alices.items).toEqual([]);
  });

  it('filters by in:#channel and from:@handle, alone or with words', async () => {
    await sent(aliceSocket, gearId, `${tag} filtered rope from alice`);
    await sent(bobSocket, gearId, `${tag} filtered rope from bob`);
    await sent(bobSocket, generalId, `${tag} filtered rope in general`);

    expect(bodies(await search(bob, `${tag} rope in:#gear`)).sort()).toEqual([`${tag} filtered rope from alice`, `${tag} filtered rope from bob`]);
    expect(bodies(await search(bob, `${tag} rope from:@${bob.handle}`)).sort()).toEqual([
      `${tag} filtered rope from bob`,
      `${tag} filtered rope in general`,
    ]);
    expect(bodies(await search(bob, `rope in:gear from:${alice.handle} ${tag}`))).toEqual([`${tag} filtered rope from alice`]);
    // A filter on its own lists everything it covers.
    const onlyFilter = await search(bob, `in:#gear from:@${alice.handle}`);
    expect(onlyFilter.items.length).toBeGreaterThan(0);
    expect(onlyFilter.items.every((i) => i.channel.id === gearId && i.message.authorId === alice.id)).toBe(true);
  });

  it('excludes -words, and a query of exclusions alone finds nothing', async () => {
    await sent(aliceSocket, generalId, `${tag} pizza night`);
    await sent(aliceSocket, generalId, `${tag} pizza and noodles night`);
    expect(bodies(await search(bob, `${tag} pizza -noodles`))).toEqual([`${tag} pizza night`]);
    expect((await search(bob, '-noodles')).items).toEqual([]);
  });

  it('leaves deleted messages out and re-indexes edits', async () => {
    const gone = await sent(aliceSocket, generalId, `${tag} vanishingword`);
    await http.delete(`/api/messages/${gone.id}`).set(alice.auth).expect(204);
    expect((await search(bob, `${tag} vanishingword`)).items).toEqual([]);
    // Deleted bodies are blanked, so words can't match anyway; a filter-only search must skip them too.
    expect((await search(bob, `from:@${alice.handle} in:#general`, { limit: 50 })).items.some((i) => i.message.id === gone.id)).toBe(false);

    const edited = await sent(aliceSocket, generalId, `${tag} beforeword`);
    await http.patch(`/api/messages/${edited.id}`).set(alice.auth).send({ body: `${tag} afterword` }).expect(200);
    expect((await search(bob, `${tag} beforeword`)).items).toEqual([]);
    expect((await search(bob, `${tag} afterword`)).items.map((i) => i.message.id)).toEqual([edited.id]);
  });

  it('finds thread replies, with their thread root', async () => {
    const root = await sent(aliceSocket, generalId, `${tag} thread root`);
    const reply = await sent(bobSocket, generalId, `${tag} deepreply inside the thread`, root.id);
    const hit = (await search(alice, `${tag} deepreply`)).items[0]!;
    expect(hit.message).toMatchObject({ id: reply.id, threadRootId: root.id });
  });

  it('answers syntax-heavy and empty queries without an error', async () => {
    for (const q of [`${tag} & | ! ( ) :* ' " \\ <-> <2>`, "'; DROP TABLE \"Message\"; --", '', '   ', 'in:', 'from:@', '-', '🧗']) {
      const res = await http.get('/api/search').query({ q, nook: slug }).set(bob.auth);
      expect(res.status, q).toBe(200);
    }
    await http.get('/api/search').query({ q: 'x'.repeat(201) }).set(bob.auth).expect(400);
    await http.get('/api/search').query({ q: 'x' }).expect(401);
  });
});
