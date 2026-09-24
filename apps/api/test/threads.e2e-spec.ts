import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { type Ack, Message, MessagePage } from '@nook/contracts';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, type Http, registerUser, type TestUser, uniqueSlug } from './helpers.js';
import { closeAll, connect, nextEvent } from './sockets.js';

let appA: NestExpressApplication;
let appB: NestExpressApplication;
let httpA: Http;
let urlA: string;
let urlB: string;
let alice: TestUser;
let bob: TestUser;
let outsider: TestUser;
let slug: string;
let generalId: string;
let otherChannelId: string;
let aliceSocket: Socket;
let bobSocket: Socket;

const send = async (socket: Socket, channelId: string, body: string, threadRootId: string | null = null) => {
  const ack = (await socket.timeout(3000).emitWithAck('message:send', { clientId: randomUUID(), channelId, body, threadRootId })) as Ack<Message>;
  return ack;
};
const sent = async (...args: Parameters<typeof send>) => {
  const ack = await send(...args);
  if (!ack.ok) throw new Error(ack.error);
  return ack.data;
};

beforeAll(async () => {
  ({ app: appA, http: httpA, url: urlA } = await bootApp());
  ({ app: appB, url: urlB } = await bootApp({ flush: false }));
  [alice, bob, outsider] = await Promise.all([registerUser(httpA, 'alice'), registerUser(httpA, 'bob'), registerUser(httpA, 'outsider')]);
  slug = uniqueSlug('threads');
  const created = await httpA.post('/api/nooks').set(alice.auth).send({ name: 'Threads', slug, kit: { field: '#1f4e79', mark: '#f28c28' } }).expect(201);
  generalId = (created.body.channels as { id: string; name: string }[]).find((c) => c.name === 'general')!.id;
  otherChannelId = (await httpA.post(`/api/nooks/${slug}/channels`).set(alice.auth).send({ name: 'other' }).expect(201)).body.id as string;
  const code = (await httpA.post(`/api/nooks/${slug}/invites`).set(alice.auth).send({}).expect(201)).body.code as string;
  await httpA.post(`/api/invites/${code}/accept`).set(bob.auth).expect(200);
  aliceSocket = await connect(urlA, alice.token);
  bobSocket = await connect(urlB, bob.token);
});

afterAll(async () => {
  closeAll();
  await appA?.close();
  await appB?.close();
});

describe('threads', () => {
  it('counts replies, tracks repliers and updates the root live across instances', async () => {
    const root = await sent(aliceSocket, generalId, 'Who is in for Saturday?');
    const rootUpdate = nextEvent<Message>(aliceSocket, 'message:updated', (m) => m.id === root.id && m.replyCount === 1);
    const reply = await sent(bobSocket, generalId, 'Me!', root.id);
    expect(reply.threadRootId).toBe(root.id);
    const updated = Message.parse(await rootUpdate);
    expect(updated.replyAuthorIds).toEqual([bob.id]);
    expect(updated.lastReplyAt).toBe(reply.createdAt);

    await sent(aliceSocket, generalId, 'Great', root.id);
    const fetched = Message.parse((await httpA.get(`/api/messages/${root.id}`).set(bob.auth).expect(200)).body);
    expect(fetched.replyCount).toBe(2);
    expect(fetched.replyAuthorIds).toEqual([alice.id, bob.id]);

    // Replies stay out of the channel's own history.
    const history = MessagePage.parse((await httpA.get(`/api/channels/${generalId}/messages`).set(bob.auth)).body);
    expect(history.items.some((m) => m.threadRootId)).toBe(false);
  });

  it('pages a thread oldest-to-newest', async () => {
    const root = await sent(aliceSocket, generalId, 'Long thread');
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await sent(i % 2 ? bobSocket : aliceSocket, generalId, `reply ${i}`, root.id)).id);
    const seen: string[] = [];
    let before: string | null = null;
    do {
      const res = await httpA.get(`/api/messages/${root.id}/replies`).query(before ? { before, limit: 2 } : { limit: 2 }).set(bob.auth).expect(200);
      const page = MessagePage.parse(res.body);
      seen.unshift(...page.items.map((m) => m.id));
      before = page.nextCursor;
    } while (before);
    expect(seen).toEqual(ids);
    await httpA.get(`/api/messages/${root.id}/replies`).set(outsider.auth).expect(404);
  });

  it('refuses replies to replies, to other channels, and to deleted messages', async () => {
    const root = await sent(aliceSocket, generalId, 'Root');
    const reply = await sent(bobSocket, generalId, 'Reply', root.id);
    expect(await send(aliceSocket, generalId, 'nested', reply.id)).toEqual({ ok: false, error: 'Replies stay one level deep: reply to the thread instead.' });
    expect(await send(aliceSocket, otherChannelId, 'wrong room', root.id)).toEqual({ ok: false, error: 'That thread isn’t in this channel.' });
    const gone = await sent(aliceSocket, generalId, 'soon deleted');
    await httpA.delete(`/api/messages/${gone.id}`).set(alice.auth).expect(204);
    expect(await send(bobSocket, generalId, 'too late', gone.id)).toEqual({ ok: false, error: 'That message can’t take replies.' });
  });

  it('decrements the count when a reply is deleted', async () => {
    const root = await sent(aliceSocket, generalId, 'Count me');
    const reply = await sent(bobSocket, generalId, 'Temporary', root.id);
    const rootUpdate = nextEvent<Message>(aliceSocket, 'message:updated', (m) => m.id === root.id && m.replyCount === 0);
    await httpA.delete(`/api/messages/${reply.id}`).set(bob.auth).expect(204);
    expect((await rootUpdate).replyAuthorIds).toEqual([]);
  });
});

describe('reactions', () => {
  const path = (id: string, emoji: string) => `/api/messages/${id}/reactions/${encodeURIComponent(emoji)}`;

  it('adds and removes idempotently, broadcasting each change across instances', async () => {
    const m = await sent(aliceSocket, generalId, 'React to me');
    const firstUpdate = nextEvent<Message>(aliceSocket, 'message:updated', (u) => u.id === m.id && u.reactions.length === 1);
    await httpA.put(path(m.id, '🧗‍♀️')).set(bob.auth).expect(200);
    expect((await firstUpdate).reactions).toEqual([{ emoji: '🧗‍♀️', count: 1, userIds: [bob.id] }]);

    await httpA.put(path(m.id, '🧗‍♀️')).set(bob.auth).expect(200); // same again: no change
    const both = Message.parse((await httpA.put(path(m.id, '🧗‍♀️')).set(alice.auth).expect(200)).body);
    expect(both.reactions).toEqual([{ emoji: '🧗‍♀️', count: 2, userIds: [bob.id, alice.id] }]);

    await httpA.delete(path(m.id, '🧗‍♀️')).set(bob.auth).expect(200);
    const removed = Message.parse((await httpA.delete(path(m.id, '🧗‍♀️')).set(bob.auth).expect(200)).body); // again: no-op
    expect(removed.reactions).toEqual([{ emoji: '🧗‍♀️', count: 1, userIds: [alice.id] }]);

    // History carries reactions too.
    const history = MessagePage.parse((await httpA.get(`/api/channels/${generalId}/messages`).set(bob.auth)).body);
    expect(history.items.find((x) => x.id === m.id)?.reactions).toEqual(removed.reactions);
  });

  it('refuses non-emoji, non-members, and system lines', async () => {
    const m = await sent(aliceSocket, generalId, 'Picky');
    for (const bad of ['a', '👍👍', '<b>']) await httpA.put(path(m.id, bad)).set(bob.auth).expect(400);
    await httpA.put(path(m.id, '👍')).set(outsider.auth).expect(404);
    const history = MessagePage.parse((await httpA.get(`/api/channels/${generalId}/messages`).set(alice.auth)).body);
    const joinLine = history.items.find((x) => x.kind === 'system')!;
    await httpA.put(path(joinLine.id, '👍')).set(alice.auth).expect(404);
  });
});
