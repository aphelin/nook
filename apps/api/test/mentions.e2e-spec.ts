import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { type Ack, Message, Notification, NotificationPage, UnreadState } from '@nook/contracts';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, type Http, registerUser, type TestUser, uniqueSlug } from './helpers.js';
import { closeAll, collect, connect, nextEvent } from './sockets.js';

let appA: NestExpressApplication;
let appB: NestExpressApplication;
let http: Http;
let urlA: string;
let urlB: string;
let alice: TestUser;
let bob: TestUser;
let cara: TestUser;
let slug: string;
let generalId: string;
let secretId: string;
let aliceSocket: Socket;
let bobSocket: Socket;
let caraSocket: Socket;

const sent = async (socket: Socket, channelId: string, body: string, threadRootId: string | null = null) => {
  const ack = (await socket
    .timeout(3000)
    .emitWithAck('message:send', { clientId: randomUUID(), channelId, body, threadRootId })) as Ack<Message>;
  if (!ack.ok) throw new Error(ack.error);
  return ack.data;
};
const unread = async (user: TestUser) => UnreadState.parse((await http.get('/api/unread').set(user.auth).expect(200)).body);
const channelUnread = async (user: TestUser, channelId: string) => (await unread(user)).channels.find((c) => c.channelId === channelId)!;
const inbox = async (user: TestUser, query: Record<string, string | number> = {}) =>
  NotificationPage.parse((await http.get('/api/notifications').query(query).set(user.auth).expect(200)).body);
const read = (user: TestUser, channelId: string, messageId: string) =>
  http.post(`/api/channels/${channelId}/read`).set(user.auth).send({ messageId });

beforeAll(async () => {
  ({ app: appA, http, url: urlA } = await bootApp());
  ({ app: appB, url: urlB } = await bootApp({ flush: false }));
  [alice, bob, cara] = await Promise.all([registerUser(http, 'alice'), registerUser(http, 'bob'), registerUser(http, 'cara')]);
  slug = uniqueSlug('mentions');
  const created = await http
    .post('/api/nooks')
    .set(alice.auth)
    .send({ name: 'Mentions', slug, kit: { field: '#1f4e79', mark: '#f28c28' } })
    .expect(201);
  generalId = (created.body.channels as { id: string; name: string }[]).find((c) => c.name === 'general')!.id;
  const code = (await http.post(`/api/nooks/${slug}/invites`).set(alice.auth).send({}).expect(201)).body.code as string;
  await http.post(`/api/invites/${code}/accept`).set(bob.auth).expect(200);
  await http.post(`/api/invites/${code}/accept`).set(cara.auth).expect(200);
  // A private channel with only Alice and Bob in it.
  secretId = (await http.post(`/api/nooks/${slug}/channels`).set(alice.auth).send({ name: 'secret', kind: 'private' }).expect(201)).body
    .id as string;
  await http
    .post(`/api/channels/${secretId}/members`)
    .set(alice.auth)
    .send({ userIds: [bob.id] })
    .expect(200);
  aliceSocket = await connect(urlA, alice.token);
  bobSocket = await connect(urlB, bob.token);
  caraSocket = await connect(urlB, cara.token);
});

afterAll(async () => {
  closeAll();
  await appA?.close();
  await appB?.close();
});

describe('mentions and notifications', () => {
  it('notifies mentioned channel members live across instances, but never the author', async () => {
    const live = nextEvent<Notification>(bobSocket, 'notification:new');
    const selfPing = collect<Notification>(aliceSocket, 'notification:new');
    const message = await sent(aliceSocket, generalId, `@${bob.handle.toUpperCase()} and @${alice.handle}: ropes at 7?`);
    expect(message.mentions).toEqual([bob.id]);

    const n = Notification.parse(await live);
    expect(n).toMatchObject({
      kind: 'mention',
      readAt: null,
      actor: { id: alice.id },
      channel: { id: generalId, name: 'general' },
      nook: { slug },
    });
    expect(n.message.id).toBe(message.id);
    expect(await selfPing).toEqual([]);
    expect((await inbox(bob)).items[0]!.id).toBe(n.id);
  });

  it('does not notify someone who is not in the channel', async () => {
    const quiet = collect<Notification>(caraSocket, 'notification:new');
    const message = await sent(aliceSocket, secretId, `@${cara.handle} you can't see this`);
    expect(message.mentions).toEqual([]);
    expect(await quiet).toEqual([]);
    expect((await inbox(cara)).items.some((i) => i.message.id === message.id)).toBe(false);
  });

  it('reply notifies the thread root author and earlier repliers, a mention wins over a reply', async () => {
    const root = await sent(aliceSocket, generalId, 'Thread about shoes');
    const toAlice = nextEvent<Notification>(aliceSocket, 'notification:new', (n) => n.kind === 'reply');
    const first = await sent(bobSocket, generalId, 'I need new ones', root.id);
    expect(Notification.parse(await toAlice).message.id).toBe(first.id);

    // Cara replies mentioning Bob: Alice (root) gets a reply notification, Bob gets a mention, not both.
    const aliceNext = nextEvent<Notification>(
      aliceSocket,
      'notification:new',
      (n) => n.message.threadRootId === root.id && n.actor?.id === cara.id,
    );
    const bobAll = collect<Notification>(bobSocket, 'notification:new', (n) => n.message.threadRootId === root.id, 800);
    await sent(caraSocket, generalId, `@${bob.handle} try the shop on Main St`, root.id);
    expect((await aliceNext).kind).toBe('reply');
    expect((await bobAll).map((n) => n.kind)).toEqual(['mention']);
  });

  it('opening a thread marks its notifications read', async () => {
    const root = await sent(bobSocket, generalId, 'Bob’s thread');
    await sent(aliceSocket, generalId, 'reply one', root.id);
    await sent(caraSocket, generalId, 'reply two', root.id);
    const before = (await inbox(bob)).items.filter((i) => i.message.threadRootId === root.id);
    expect(before.map((i) => i.readAt)).toEqual([null, null]);
    const changed = nextEvent(bobSocket, 'unread:changed');
    await http.post('/api/notifications/read').set(bob.auth).send({ threadRootId: root.id }).expect(204);
    await changed;
    const after = (await inbox(bob)).items.filter((i) => i.message.threadRootId === root.id);
    expect(after.every((i) => i.readAt)).toBe(true);
  });
});

describe('unread', () => {
  it('unread counts and mention counts follow the read pointer', async () => {
    const channelId = (await http.post(`/api/nooks/${slug}/channels`).set(alice.auth).send({ name: 'counts' }).expect(201)).body
      .id as string;
    const start = await channelUnread(cara, channelId);
    expect(start).toMatchObject({ kind: 'public', unread: 0, mentions: 0, lastReadId: null });

    const m1 = await sent(aliceSocket, channelId, 'one');
    await sent(bobSocket, channelId, `two @${cara.handle}`);
    await sent(caraSocket, channelId, 'my own message does not count');
    const m3 = await sent(aliceSocket, channelId, 'three');
    // A thread reply does not count towards the channel.
    await sent(bobSocket, channelId, 'side note', m1.id);
    expect(await channelUnread(cara, channelId)).toMatchObject({ unread: 3, mentions: 1 });

    await read(cara, channelId, m1.id).expect(204);
    expect(await channelUnread(cara, channelId)).toMatchObject({ unread: 2, mentions: 1, lastReadId: m1.id });
    await read(cara, channelId, m3.id).expect(204);
    expect(await channelUnread(cara, channelId)).toMatchObject({ unread: 0, mentions: 0, lastReadId: m3.id });
  });

  it('read pointer never moves backwards, and never to a message from another channel', async () => {
    const early = await sent(aliceSocket, generalId, 'early');
    const late = await sent(aliceSocket, generalId, 'late');
    await read(bob, generalId, late.id).expect(204);
    await read(bob, generalId, early.id).expect(204);
    expect((await channelUnread(bob, generalId)).lastReadId).toBe(late.id);

    const elsewhere = await sent(aliceSocket, secretId, 'in secret');
    await read(bob, generalId, elsewhere.id).expect(404);
    await read(cara, secretId, elsewhere.id).expect(404);
    await read(bob, generalId, randomUUID()).expect(404);
    expect((await channelUnread(bob, generalId)).lastReadId).toBe(late.id);
  });

  it('reading a channel past a mention clears its notification and tells your other tabs', async () => {
    const mention = await sent(aliceSocket, generalId, `@${cara.handle} are you coming?`);
    const n = (await inbox(cara)).items.find((i) => i.message.id === mention.id)!;
    expect(n.readAt).toBeNull();
    const inboxBefore = (await unread(cara)).inbox;
    const otherTab = await connect(urlA, cara.token);
    const told = nextEvent(otherTab, 'unread:changed');
    await read(cara, generalId, mention.id).expect(204);
    await told;
    expect((await inbox(cara)).items.find((i) => i.id === n.id)!.readAt).not.toBeNull();
    expect((await unread(cara)).inbox).toBe(inboxBefore - 1);
  });
});

describe('edits and deletes', () => {
  it('an edit that adds a mention notifies once; one that removes it takes the notification back', async () => {
    const message = await sent(aliceSocket, generalId, 'plain words');
    const live = nextEvent<Notification>(caraSocket, 'notification:new', (n) => n.message.id === message.id);
    const edited = Message.parse(
      (
        await http
          .patch(`/api/messages/${message.id}`)
          .set(alice.auth)
          .send({ body: `plain words, cc @${cara.handle}` })
          .expect(200)
      ).body,
    );
    expect(edited.mentions).toEqual([cara.id]);
    await live;

    // Editing again with the mention still there doesn't notify twice.
    const again = collect<Notification>(caraSocket, 'notification:new', (n) => n.message.id === message.id, 600);
    await http
      .patch(`/api/messages/${message.id}`)
      .set(alice.auth)
      .send({ body: `plain words!! cc @${cara.handle}` })
      .expect(200);
    expect(await again).toEqual([]);
    expect((await inbox(cara)).items.filter((i) => i.message.id === message.id)).toHaveLength(1);

    const changed = nextEvent(caraSocket, 'unread:changed');
    await http.patch(`/api/messages/${message.id}`).set(alice.auth).send({ body: 'never mind' }).expect(200);
    await changed;
    expect((await inbox(cara)).items.some((i) => i.message.id === message.id)).toBe(false);
  });

  it('a deleted message drops out of the inbox and the counts', async () => {
    const channelId = (await http.post(`/api/nooks/${slug}/channels`).set(alice.auth).send({ name: 'deletes' }).expect(201)).body
      .id as string;
    const message = await sent(aliceSocket, channelId, `@${bob.handle} oops wrong person`);
    expect(await channelUnread(bob, channelId)).toMatchObject({ unread: 1, mentions: 1 });
    const inboxBefore = (await unread(bob)).inbox;
    const changed = nextEvent(bobSocket, 'unread:changed');
    await http.delete(`/api/messages/${message.id}`).set(alice.auth).expect(204);
    await changed;
    expect(await channelUnread(bob, channelId)).toMatchObject({ unread: 0, mentions: 0 });
    expect((await unread(bob)).inbox).toBe(inboxBefore - 1);
    expect((await inbox(bob)).items.some((i) => i.message.id === message.id)).toBe(false);
  });
});

describe('notifications page', () => {
  it('pages newest first and marks some or all read', async () => {
    const channelId = (await http.post(`/api/nooks/${slug}/channels`).set(alice.auth).send({ name: 'paging' }).expect(201)).body
      .id as string;
    for (let i = 0; i < 5; i++) await sent(aliceSocket, channelId, `ping ${i} @${cara.handle}`);
    const first = await inbox(cara, { limit: 3 });
    expect(first.items.map((i) => i.message.body)).toEqual(['ping 4', 'ping 3', 'ping 2'].map((b) => `${b} @${cara.handle}`));
    const second = await inbox(cara, { limit: 3, before: first.nextCursor! });
    expect(second.items.map((i) => i.message.body.split(' @')[0])).toEqual(['ping 1', 'ping 0', expect.any(String)]);

    await http
      .post('/api/notifications/read')
      .set(cara.auth)
      .send({ ids: [first.items[0]!.id] })
      .expect(204);
    expect((await inbox(cara, { limit: 1 })).items[0]!.readAt).not.toBeNull();
    // Someone else's notification ids are ignored.
    await http
      .post('/api/notifications/read')
      .set(bob.auth)
      .send({ ids: [first.items[1]!.id] })
      .expect(204);
    expect((await inbox(cara, { limit: 2 })).items[1]!.readAt).toBeNull();

    await http.post('/api/notifications/read').set(cara.auth).send({ all: true }).expect(204);
    expect((await unread(cara)).inbox).toBe(0);
    await http.post('/api/notifications/read').set(cara.auth).send({}).expect(400);
  });
});
