import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { type Ack, Message, MessagePage } from '@nook/contracts';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, type Http, registerUser, type TestUser, uniqueSlug } from './helpers.js';
import { closeAll, collect, connect, nextEvent } from './sockets.js';

// Two api instances sharing Postgres and Redis, like api-1 and api-2 behind nginx.
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
let aliceSocket: Socket;
let bobSocket: Socket;

const send = (socket: Socket, channelId: string, body: string, clientId: string = randomUUID()) =>
  socket.timeout(3000).emitWithAck('message:send', { clientId, channelId, body }) as Promise<Ack<Message>>;

beforeAll(async () => {
  ({ app: appA, http: httpA, url: urlA } = await bootApp());
  ({ app: appB, http: httpB, url: urlB } = await bootApp({ flush: false }));
  [alice, bob, outsider] = await Promise.all([registerUser(httpA, 'alice'), registerUser(httpA, 'bob'), registerUser(httpA, 'outsider')]);
  slug = uniqueSlug('chat');
  const created = await httpA.post('/api/nooks').set(alice.auth).send({ name: 'Chat Club', slug, kit: { field: '#1f4e79', mark: '#f28c28' } }).expect(201);
  generalId = (created.body.channels as { id: string; name: string }[]).find((c) => c.name === 'general')!.id;
  const code = (await httpA.post(`/api/nooks/${slug}/invites`).set(alice.auth).send({}).expect(201)).body.code as string;
  await httpB.post(`/api/invites/${code}/accept`).set(bob.auth).expect(200);
  aliceSocket = await connect(urlA, alice.token);
  bobSocket = await connect(urlB, bob.token);
});

afterAll(async () => {
  closeAll();
  await appA?.close();
  await appB?.close();
});

describe('handshake', () => {
  it('refuses sockets without a valid access token', async () => {
    await expect(connect(urlA, null)).rejects.toThrow('unauthorized');
    await expect(connect(urlA, 'not-a-jwt')).rejects.toThrow('unauthorized');
  });
});

describe('sending', () => {
  it('delivers across api instances through the Redis adapter', async () => {
    const received = nextEvent<Message>(bobSocket, 'message:new', (m) => m.body === 'hello from instance A');
    const ack = await send(aliceSocket, generalId, '  hello from instance A  ');
    expect(ack.ok).toBe(true);
    const onB = Message.parse(await received);
    expect(ack.ok && ack.data.id).toBe(onB.id);
    expect(onB).toMatchObject({ authorId: alice.id, kind: 'user', body: 'hello from instance A', editedAt: null });
  });

  it('treats a retry with the same clientId as the same message', async () => {
    const clientId = randomUUID();
    const deliveries = collect<Message>(bobSocket, 'message:new', (m) => m.clientId === clientId);
    const first = await send(aliceSocket, generalId, 'sent twice', clientId);
    const retry = await send(aliceSocket, generalId, 'sent twice', clientId);
    expect(first.ok && retry.ok).toBe(true);
    expect(first.ok && retry.ok && retry.data.id === first.data.id).toBe(true);
    expect(await deliveries).toHaveLength(1);
  });

  it('refuses non-members and empty messages', async () => {
    const outsiderSocket = await connect(urlB, outsider.token);
    expect(await send(outsiderSocket, generalId, 'let me in')).toEqual({ ok: false, error: 'Channel not found' });
    expect(await send(aliceSocket, generalId, '   ')).toEqual({ ok: false, error: 'Write something first' });
    await httpA.get(`/api/channels/${generalId}/messages`).set(outsider.auth).expect(404);
  });

  it('rate-limits a flood of messages per user', async () => {
    const acks = [];
    for (let i = 0; i < 21; i++) acks.push(await send(bobSocket, generalId, `flood ${i}`));
    expect(acks.slice(0, 20).every((a) => a.ok)).toBe(true);
    expect(acks[20]).toMatchObject({ ok: false, error: expect.stringMatching(/Too many attempts/) });
  });
});

describe('history', () => {
  it('pages backwards through a channel in time order', async () => {
    const created = await httpA.post(`/api/nooks/${slug}/channels`).set(alice.auth).send({ name: 'history' }).expect(201);
    const channelId = created.body.id as string;
    const sent: string[] = [];
    for (let i = 0; i < 7; i++) {
      const ack = await send(aliceSocket, channelId, `line ${i}`);
      if (ack.ok) sent.push(ack.data.id);
    }
    const seen: Message[] = [];
    let before: string | null = null;
    do {
      const res = await httpB.get(`/api/channels/${channelId}/messages`).query(before ? { before, limit: 3 } : { limit: 3 }).set(bob.auth).expect(200);
      const page = MessagePage.parse(res.body);
      expect(page.items.length).toBeLessThanOrEqual(3);
      seen.unshift(...page.items);
      before = page.nextCursor;
    } while (before);
    // A channel's history opens with who opened it, then every message in the order it was sent.
    const [opener, ...rest] = seen;
    expect(opener).toMatchObject({ kind: 'system', body: 'channel_created', authorId: alice.id });
    expect(rest.map((m) => m.id)).toEqual(sent);
  });

  it('delivers in a channel created after the socket connected', async () => {
    const created = await httpA.post(`/api/nooks/${slug}/channels`).set(alice.auth).send({ name: 'late-room' }).expect(201);
    const received = nextEvent<Message>(bobSocket, 'message:new', (m) => m.channelId === created.body.id && m.kind === 'user');
    await send(aliceSocket, created.body.id as string, 'bob should see this');
    expect((await received).body).toBe('bob should see this');
  });
});

describe('edit and delete', () => {
  it('lets only the author edit or delete, and broadcasts both', async () => {
    const ack = await send(aliceSocket, generalId, 'typo teh');
    if (!ack.ok) throw new Error(ack.error);
    const id = ack.data.id;

    await httpB.patch(`/api/messages/${id}`).set(bob.auth).send({ body: 'hijack' }).expect(403);
    const edited = nextEvent<Message>(bobSocket, 'message:updated', (m) => m.id === id && !!m.editedAt);
    await httpA.patch(`/api/messages/${id}`).set(alice.auth).send({ body: 'typo the' }).expect(200);
    expect((await edited).body).toBe('typo the');

    await httpB.delete(`/api/messages/${id}`).set(bob.auth).expect(403);
    const deleted = nextEvent<Message>(bobSocket, 'message:updated', (m) => m.id === id && !!m.deletedAt);
    await httpA.delete(`/api/messages/${id}`).set(alice.auth).expect(204);
    expect((await deleted).body).toBe('');
    await httpA.patch(`/api/messages/${id}`).set(alice.auth).send({ body: 'resurrect' }).expect(404);
  });
});

describe('system lines', () => {
  it('prints a join line in #general and nudges members to refetch the nook', async () => {
    const carol = await registerUser(httpA, 'carol');
    const code = (await httpA.post(`/api/nooks/${slug}/invites`).set(alice.auth).send({}).expect(201)).body.code as string;
    const line = nextEvent<Message>(aliceSocket, 'message:new', (m) => m.kind === 'system');
    const nudge = nextEvent<{ slug: string }>(aliceSocket, 'nook:updated', (e) => e.slug === slug);
    await httpB.post(`/api/invites/${code}/accept`).set(carol.auth).expect(200);
    expect(await line).toMatchObject({ kind: 'system', body: 'member_joined', authorId: carol.id, channelId: generalId });
    expect(await nudge).toEqual({ slug });
  });
});
