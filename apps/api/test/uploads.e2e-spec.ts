import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { type Ack, Attachment, Message, UploadTicket } from '@nook/contracts';
import sharp from 'sharp';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { StorageService } from '../src/storage/storage.service.js';
import { UploadsService } from '../src/uploads/uploads.service.js';
import { WorkerModule } from '../src/worker.module.js';
import { bootApp, type Http, registerUser, type TestUser, uniqueSlug } from './helpers.js';
import { closeAll, connect, nextEvent } from './sockets.js';

let app: NestExpressApplication;
let worker: INestApplicationContext;
let http: Http;
let url: string;
let alice: TestUser;
let bob: TestUser;
let generalId: string;
let aliceSocket: Socket;
let bobSocket: Socket;
let ogServer: Server;
let ogUrl: string;

const ticket = (u: TestUser, body: object) => http.post('/api/uploads').set(u.auth).send(body);

/** The browser's half of an upload: PUT straight to storage with the signed URL. */
async function upload(u: TestUser, fileName: string, mimeType: string, bytes: Buffer): Promise<string> {
  const t = UploadTicket.parse((await ticket(u, { fileName, mimeType, size: bytes.length }).expect(201)).body);
  const put = await fetch(t.uploadUrl, { method: 'PUT', headers: t.headers, body: new Uint8Array(bytes) });
  expect(put.status).toBe(200);
  return t.attachmentId;
}

const send = (socket: Socket, body: string, attachmentIds: string[]) =>
  socket.timeout(5000).emitWithAck('message:send', { clientId: randomUUID(), channelId: generalId, body, attachmentIds }) as Promise<Ack<Message>>;

beforeAll(async () => {
  // Tests only: lets the unfurler reach the local page below.
  process.env.UNFURL_ALLOW_PRIVATE = 'true';
  ({ app, http, url } = await bootApp());
  worker = await NestFactory.createApplicationContext(WorkerModule, { logger: ['error', 'warn'] });
  [alice, bob] = await Promise.all([registerUser(http, 'alice'), registerUser(http, 'bob')]);
  const slug = uniqueSlug('uploads');
  const created = await http.post('/api/nooks').set(alice.auth).send({ name: 'Uploads', slug, kit: { field: '#1f4e79', mark: '#f28c28' } }).expect(201);
  generalId = (created.body.channels as { id: string; name: string }[]).find((c) => c.name === 'general')!.id;
  const code = (await http.post(`/api/nooks/${slug}/invites`).set(alice.auth).send({}).expect(201)).body.code as string;
  await http.post(`/api/invites/${code}/accept`).set(bob.auth).expect(200);
  aliceSocket = await connect(url, alice.token);
  bobSocket = await connect(url, bob.token);

  ogServer = createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><title>Fallback</title>
      <meta property="og:title" content="Fontainebleau &amp; the Bas Cuvier circuit">
      <meta property="og:description" content="Sandstone boulders an hour south of Paris.">
      <meta property="og:site_name" content="Bleau Guide">
      <meta property="og:image" content="https://images.example.test/bleau.jpg">
      </head><body>${'x'.repeat(10)}</body></html>`);
  });
  await new Promise<void>((r) => ogServer.listen(0, '127.0.0.1', r));
  ogUrl = `http://127.0.0.1:${(ogServer.address() as { port: number }).port}/bleau`;
});

afterAll(async () => {
  closeAll();
  ogServer?.close();
  await worker?.close();
  await app?.close();
  delete process.env.UNFURL_ALLOW_PRIVATE;
});

describe('upload tickets', () => {
  it('refuses unsupported types and oversize files', async () => {
    expect((await ticket(alice, { fileName: 'x.exe', mimeType: 'application/x-msdownload', size: 10 }).expect(400)).body.issues[0].message).toMatch(/can’t be shared/);
    expect((await ticket(alice, { fileName: 'big.png', mimeType: 'image/png', size: 11 * 1024 * 1024 }).expect(400)).body.issues[0].message).toMatch(/up to 10 MB/);
  });

  it('refuses to complete before the bytes arrive, and storage refuses a different size than signed', async () => {
    const t = UploadTicket.parse((await ticket(alice, { fileName: 'notes.txt', mimeType: 'text/plain', size: 5 }).expect(201)).body);
    expect((await http.post(`/api/uploads/${t.attachmentId}/complete`).set(alice.auth).expect(400)).body.message).toMatch(/hasn’t finished/);
    const wrongSize = await fetch(t.uploadUrl, { method: 'PUT', headers: t.headers, body: new Uint8Array(Buffer.from('not five bytes')) });
    expect(wrongSize.ok).toBe(false);
    await http.post(`/api/uploads/${t.attachmentId}/complete`).set(bob.auth).expect(404);
  });
});

describe('attachments', () => {
  it('sends a file on its own and serves it through a signed URL', async () => {
    const id = await upload(alice, 'route notes.txt', 'text/plain', Buffer.from('Heel hook, then match.'));
    const ready = Attachment.parse((await http.post(`/api/uploads/${id}/complete`).set(alice.auth).expect(200)).body);
    expect(ready.status).toBe('ready');

    const received = nextEvent<Message>(bobSocket, 'message:new', (m) => m.attachments.some((a) => a.id === id));
    const ack = await send(aliceSocket, '', [id]);
    expect(ack.ok).toBe(true);
    const [file] = (await received).attachments;
    expect(file).toMatchObject({ fileName: 'route notes.txt', mimeType: 'text/plain', size: 22 });
    const download = await fetch(file!.url);
    expect(await download.text()).toBe('Heel hook, then match.');
    expect(download.headers.get('content-disposition')).toMatch(/^attachment/);
  });

  it('thumbnails images in the worker and broadcasts the real (rotated) dimensions', async () => {
    // 1200×600 pixels, but EXIF orientation 6: it displays as 600×1200.
    const photo = await sharp({ create: { width: 1200, height: 600, channels: 3, background: '#1f4e79' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const id = await upload(alice, 'wall.jpg', 'image/jpeg', photo);
    await http.post(`/api/uploads/${id}/complete`).set(alice.auth).expect(200);
    const ready = nextEvent<Message>(bobSocket, 'message:updated', (m) => m.attachments.some((a) => a.id === id && a.status === 'ready'), 10_000);
    const ack = await send(aliceSocket, 'New wall!', [id]);
    expect(ack.ok).toBe(true);
    // The worker may finish before the send; either way a ready version must reach Bob.
    const image = ack.ok && ack.data.attachments[0]!.status === 'ready' ? ack.data.attachments[0]! : (await ready).attachments[0]!;
    expect(image).toMatchObject({ width: 600, height: 1200, status: 'ready' });
    const thumb = await fetch(image.thumbUrl!);
    expect(thumb.headers.get('content-type')).toBe('image/webp');
    const meta = await sharp(Buffer.from(await thumb.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([400, 800]);
  });

  it('refuses someone else’s upload and an upload that was already sent', async () => {
    const id = await upload(alice, 'mine.txt', 'text/plain', Buffer.from('mine'));
    await http.post(`/api/uploads/${id}/complete`).set(alice.auth).expect(200);
    expect(await send(bobSocket, 'stolen', [id])).toEqual({ ok: false, error: 'One of those files isn’t available to send.' });
    expect((await send(aliceSocket, 'first', [id])).ok).toBe(true);
    expect(await send(aliceSocket, 'again', [id])).toEqual({ ok: false, error: 'One of those files isn’t available to send.' });
  });

  it('cleans up uploads that were never sent', async () => {
    const id = await upload(alice, 'abandoned.txt', 'text/plain', Buffer.from('bye'));
    const prisma = app.get(PrismaService);
    const row = await prisma.attachment.update({ where: { id }, data: { createdAt: new Date(Date.now() - 25 * 3_600_000) } });
    expect(await worker.get(UploadsService).cleanupStale()).toBeGreaterThanOrEqual(1);
    expect(await prisma.attachment.findUnique({ where: { id } })).toBeNull();
    expect(await app.get(StorageService).head(row.storageKey)).toBeNull();
  });
});

describe('link previews', () => {
  it('unfurls a link in the worker and pushes the card to the channel', async () => {
    const card = nextEvent<Message>(bobSocket, 'message:updated', (m) => m.linkPreviews.length > 0, 10_000);
    const ack = await send(aliceSocket, `Trip idea: ${ogUrl} for the spring?`, []);
    expect(ack.ok).toBe(true);
    const [preview] = (await card).linkPreviews;
    expect(preview).toEqual({
      url: ogUrl,
      title: 'Fontainebleau & the Bas Cuvier circuit',
      description: 'Sandstone boulders an hour south of Paris.',
      siteName: 'Bleau Guide',
      imageUrl: 'https://images.example.test/bleau.jpg',
    });
  });
});
