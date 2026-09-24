import type { NestExpressApplication } from '@nestjs/platform-express';
import { AvatarTicket, PublicUser } from '@nook/contracts';
import sharp from 'sharp';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StorageService } from '../src/storage/storage.service.js';
import { UsersService } from '../src/users/users.service.js';
import { bootApp, type Http, registerUser, type TestUser, uniqueSlug } from './helpers.js';
import { closeAll, collect, connect, nextEvent } from './sockets.js';

let app: NestExpressApplication;
let http: Http;
let url: string;
let alice: TestUser;
let bob: TestUser;
let stranger: TestUser;
let bobSocket: Socket;
let strangerSocket: Socket;

const patch = (u: TestUser, body: object) => http.patch('/api/users/me').set(u.auth).send(body);
const me = async (u: TestUser) => PublicUser.parse((await http.get('/api/users/me').set(u.auth).expect(200)).body);

async function uploadAvatar(u: TestUser, bytes: Buffer, mimeType = 'image/png') {
  const t = AvatarTicket.parse((await http.post('/api/users/me/avatar').set(u.auth).send({ mimeType, size: bytes.length }).expect(201)).body);
  const put = await fetch(t.uploadUrl, { method: 'PUT', headers: t.headers, body: new Uint8Array(bytes) });
  expect(put.status).toBe(200);
  return t.uploadId;
}
const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 60, b: 40 } } })
    .png()
    .toBuffer();

beforeAll(async () => {
  ({ app, http, url } = await bootApp());
  [alice, bob, stranger] = await Promise.all([registerUser(http, 'alice'), registerUser(http, 'bob'), registerUser(http, 'stranger')]);
  const slug = uniqueSlug('profiles');
  await http.post('/api/nooks').set(alice.auth).send({ name: 'Profiles', slug, kit: { field: '#1f4e79', mark: '#f28c28' } }).expect(201);
  const code = (await http.post(`/api/nooks/${slug}/invites`).set(alice.auth).send({}).expect(201)).body.code as string;
  await http.post(`/api/invites/${code}/accept`).set(bob.auth).expect(200);
  bobSocket = await connect(url, bob.token);
  strangerSocket = await connect(url, stranger.token);
});

afterAll(async () => {
  closeAll();
  await app?.close();
});

describe('profiles', () => {
  it('updates and normalises a profile, and validates it', async () => {
    const res = await patch(alice, { displayName: '  Alice Arden ', pronouns: 'she/her', bio: '  Climbs, reads.  ', status: { emoji: '🧗', text: ' At the crag ' } }).expect(200);
    expect(PublicUser.parse(res.body)).toMatchObject({
      displayName: 'Alice Arden',
      pronouns: 'she/her',
      bio: 'Climbs, reads.',
      status: { emoji: '🧗', text: 'At the crag', expiresAt: null },
    });
    // Null clears pronouns; untouched fields stay. Only he/him and she/her are accepted.
    expect((await patch(alice, { pronouns: null }).expect(200)).body).toMatchObject({ pronouns: null, bio: 'Climbs, reads.' });
    await patch(alice, { pronouns: 'they/them' }).expect(400);
    await patch(alice, { pronouns: '' }).expect(400);
    expect((await patch(alice, { pronouns: 'he/him' }).expect(200)).body).toMatchObject({ pronouns: 'he/him' });

    await patch(alice, { displayName: '   ' }).expect(400);
    await patch(alice, { bio: 'x'.repeat(281) }).expect(400);
    await patch(alice, { status: { emoji: 'not an emoji', text: null } }).expect(400);
    await patch(alice, { status: { emoji: '👍👍', text: null } }).expect(400);
    await http.patch('/api/users/me').send({ bio: 'hi' }).expect(401);
    expect((await me(alice)).displayName).toBe('Alice Arden');
  });

  it('lets a status clear itself at its expiry time', async () => {
    const expiresAt = new Date(Date.now() + 1200).toISOString();
    const set = PublicUser.parse((await patch(alice, { status: { emoji: '🍜', text: 'Lunch', expiresAt } }).expect(200)).body);
    expect(set.status).toEqual({ emoji: '🍜', text: 'Lunch', expiresAt });
    await new Promise((r) => setTimeout(r, 1400));
    expect((await me(alice)).status).toEqual({ emoji: null, text: null, expiresAt: null });
    // Clearing the status entirely clears its expiry too.
    const cleared = PublicUser.parse((await patch(alice, { status: null }).expect(200)).body);
    expect(cleared.status).toEqual({ emoji: null, text: null, expiresAt: null });
  });

  it('tells people who share a nook live, and nobody else', async () => {
    const toBob = nextEvent<PublicUser>(bobSocket, 'user:updated', (u) => u.id === alice.id && u.bio === 'Live bio');
    const toStranger = collect<PublicUser>(strangerSocket, 'user:updated', (u) => u.id === alice.id, 600);
    await patch(alice, { bio: 'Live bio' }).expect(200);
    expect(PublicUser.parse(await toBob).bio).toBe('Live bio');
    expect(await toStranger).toEqual([]);
  });
});

describe('avatars', () => {
  it('refuses the wrong type or size before anything is uploaded', async () => {
    await http.post('/api/users/me/avatar').set(alice.auth).send({ mimeType: 'image/svg+xml', size: 100 }).expect(400);
    await http.post('/api/users/me/avatar').set(alice.auth).send({ mimeType: 'image/png', size: 6 * 1024 * 1024 }).expect(400);
  });

  it('crops an upload to a 256px square WebP behind a stable redirecting URL, and announces it', async () => {
    const uploadId = await uploadAvatar(alice, await png(900, 500));
    const told = nextEvent<PublicUser>(bobSocket, 'user:updated', (u) => u.id === alice.id && !!u.avatarUrl);
    const user = PublicUser.parse((await http.post(`/api/users/me/avatar/${uploadId}/complete`).set(alice.auth).expect(201)).body);
    expect(user.avatarUrl).toBe(`/api/users/${alice.id}/avatar?v=${uploadId}`);
    expect((await told).avatarUrl).toBe(user.avatarUrl);

    // Public (an <img> sends no token), redirecting to the signed storage URL.
    const redirect = await http.get(user.avatarUrl!).expect(302);
    const image = await fetch(redirect.headers.location!);
    expect(image.status).toBe(200);
    const meta = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 });

    // The original is gone once processed; completing twice finds nothing.
    await http.post(`/api/users/me/avatar/${uploadId}/complete`).set(alice.auth).expect(404);
  });

  it('refuses bytes that are not an image, and uploads that are not yours', async () => {
    const fake = await uploadAvatar(alice, Buffer.from('definitely not a png, just text pretending'));
    await http.post(`/api/users/me/avatar/${fake}/complete`).set(alice.auth).expect(400);
    const bobs = await uploadAvatar(bob, await png(64, 64));
    // Alice can't complete Bob's upload: it isn't under her prefix.
    await http.post(`/api/users/me/avatar/${bobs}/complete`).set(alice.auth).expect(404);
    await http.post(`/api/users/me/avatar/${bobs}/complete`).set(bob.auth).expect(201);
  });

  it('replacing an avatar deletes the old one; removing it clears it', async () => {
    const storage = app.get(StorageService);
    const first = await uploadAvatar(alice, await png(300, 300));
    await http.post(`/api/users/me/avatar/${first}/complete`).set(alice.auth).expect(201);
    const firstKey = `avatars/${alice.id}/${first}.webp`;
    expect(await storage.head(firstKey)).not.toBeNull();

    const second = await uploadAvatar(alice, await png(300, 300), 'image/png');
    await http.post(`/api/users/me/avatar/${second}/complete`).set(alice.auth).expect(201);
    expect(await storage.head(firstKey)).toBeNull();

    const removed = PublicUser.parse((await http.delete('/api/users/me/avatar').set(alice.auth).expect(200)).body);
    expect(removed.avatarUrl).toBeNull();
    expect(await storage.head(`avatars/${alice.id}/${second}.webp`)).toBeNull();
    await http.get(`/api/users/${alice.id}/avatar`).expect(404);
  });

  it('sweeps avatar uploads that were never completed', async () => {
    const abandoned = await uploadAvatar(bob, await png(40, 40));
    const storage = app.get(StorageService);
    const key = `avatar-uploads/${bob.id}/${abandoned}`;
    const users = app.get(UsersService);
    expect(await users.cleanupAbandonedAvatars(Date.now())).toBe(0);
    expect(await storage.head(key)).not.toBeNull();
    await users.cleanupAbandonedAvatars(Date.now() + 25 * 3_600_000);
    expect(await storage.head(key)).toBeNull();
  });
});
