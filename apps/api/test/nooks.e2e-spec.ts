import type { NestExpressApplication } from '@nestjs/platform-express';
import { Channel, InvitePreview, NookDetail } from '@nook/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bootApp, type Http, registerUser, type TestUser, uniqueSlug } from './helpers.js';

let app: NestExpressApplication;
let http: Http;
let prisma: PrismaService;
let founder: TestUser;
let friend: TestUser;
let outsider: TestUser;
let slug: string;

const kit = { field: '#1F4E79', mark: '#f28c28' };

beforeAll(async () => {
  ({ app, http } = await bootApp());
  prisma = app.get(PrismaService);
  [founder, friend, outsider] = await Promise.all([registerUser(http, 'founder'), registerUser(http, 'friend'), registerUser(http, 'outsider')]);
  slug = uniqueSlug('climbers');
});

afterAll(async () => {
  await app?.close();
});

function join(user: TestUser, invite: string) {
  return http.post(`/api/invites/${invite}/accept`).set(user.auth);
}

describe('nooks', () => {
  it('creates a nook with the founder as its only member and a #general channel', async () => {
    const res = await http
      .post('/api/nooks')
      .set(founder.auth)
      .send({ name: 'Tuesday Climbers', slug, description: 'Bouldering, then noodles.', kit })
      .expect(201);
    const detail = NookDetail.parse(res.body);
    expect(detail.nook.kit).toEqual({ field: '#1f4e79', mark: '#f28c28' });
    expect(detail.nook.memberCount).toBe(1);
    expect(detail.channels.map((c) => c.name)).toEqual(['general']);
    expect(detail.members).toHaveLength(1);
    expect(detail.members[0]).toMatchObject({ id: founder.id, isOwner: true });
  });

  it('rejects a taken slug and invalid input', async () => {
    const taken = await http.post('/api/nooks').set(founder.auth).send({ name: 'Again', slug, kit }).expect(409);
    expect(taken.body.message).toMatch(/address is taken/);
    const bad = await http.post('/api/nooks').set(founder.auth).send({ name: '', slug: 'Bad Slug', kit: { field: 'green', mark: '#fff' } }).expect(400);
    expect((bad.body.issues as { path: string }[]).map((i) => i.path).sort()).toEqual(['kit.field', 'kit.mark', 'name', 'slug']);
  });

  it('lists only the nooks you belong to', async () => {
    const mine = await http.get('/api/nooks').set(founder.auth).expect(200);
    expect((mine.body as { slug: string }[]).some((n) => n.slug === slug)).toBe(true);
    const theirs = await http.get('/api/nooks').set(outsider.auth).expect(200);
    expect((theirs.body as { slug: string }[]).some((n) => n.slug === slug)).toBe(false);
  });

  it('hides a nook from non-members with a 404', async () => {
    await http.get(`/api/nooks/${slug}`).set(outsider.auth).expect(404);
    await http.post(`/api/nooks/${slug}/channels`).set(outsider.auth).send({ name: 'sneaky' }).expect(404);
  });

  it('lets only the founder change the kit', async () => {
    const res = await http.patch(`/api/nooks/${slug}`).set(founder.auth).send({ kit: { field: '#0f5257', mark: '#f4d35e' } }).expect(200);
    expect(res.body.kit).toEqual({ field: '#0f5257', mark: '#f4d35e' });
  });
});

describe('invites', () => {
  let code: string;

  it('previews publicly and admits a new member into every public channel', async () => {
    code = (await http.post(`/api/nooks/${slug}/invites`).set(founder.auth).send({}).expect(201)).body.code as string;
    expect(code).toMatch(/^[2-9a-zA-Z]{10}$/);

    const preview = InvitePreview.parse((await http.get(`/api/invites/${code}`).expect(200)).body);
    expect(preview).toMatchObject({ status: 'valid', nook: { name: 'Tuesday Climbers', memberCount: 1 } });

    await join(friend, code).expect(200);
    const detail = NookDetail.parse((await http.get(`/api/nooks/${slug}`).set(friend.auth).expect(200)).body);
    expect(detail.members.map((m) => m.id).sort()).toEqual([founder.id, friend.id].sort());
    const general = detail.channels.find((c) => c.name === 'general')!;
    expect(await prisma.channelMember.count({ where: { channelId: general.id } })).toBe(2);
  });

  it('is idempotent for existing members and does not spend a use', async () => {
    await join(friend, code).expect(200);
    const invite = await prisma.invite.findUniqueOrThrow({ where: { code } });
    expect(invite.uses).toBe(1);
  });

  it('treats a double-clicked join as one join', async () => {
    const fresh = (await http.post(`/api/nooks/${slug}/invites`).set(founder.auth).send({}).expect(201)).body.code as string;
    const clicker = await registerUser(http, 'clicker');
    const [a, b] = await Promise.all([join(clicker, fresh), join(clicker, fresh)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((await prisma.invite.findUniqueOrThrow({ where: { code: fresh } })).uses).toBe(1);
  });

  it('admits exactly maxUses people even when they click at the same time', async () => {
    const limited = (await http.post(`/api/nooks/${slug}/invites`).set(founder.auth).send({ maxUses: 2 }).expect(201)).body.code as string;
    const crowd = await Promise.all([1, 2, 3, 4].map((i) => registerUser(http, `crowd${i}`)));
    const results = await Promise.all(crowd.map((u) => join(u, limited)));
    expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([200, 200, 409, 409]);
    expect((await prisma.invite.findUniqueOrThrow({ where: { code: limited } })).uses).toBe(2);
    expect(InvitePreview.parse((await http.get(`/api/invites/${limited}`)).body).status).toBe('used_up');
  });

  it('refuses expired and revoked invites', async () => {
    const expiring = (await http.post(`/api/nooks/${slug}/invites`).set(founder.auth).send({ expiresInHours: 1 }).expect(201)).body.code as string;
    await prisma.invite.update({ where: { code: expiring }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await join(outsider, expiring).expect(409)).body.message).toMatch(/expired or been used up/);
    expect(InvitePreview.parse((await http.get(`/api/invites/${expiring}`)).body).status).toBe('expired');

    const revocable = (await http.post(`/api/nooks/${slug}/invites`).set(founder.auth).send({}).expect(201)).body.code as string;
    await http.delete(`/api/invites/${revocable}`).set(outsider.auth).expect(404);
    await http.delete(`/api/invites/${revocable}`).set(founder.auth).expect(204);
    await join(outsider, revocable).expect(409);
    expect(InvitePreview.parse((await http.get(`/api/invites/${revocable}`)).body).status).toBe('revoked');
    await http.get('/api/invites/doesnotexist').expect(404);
  });
});

describe('channels', () => {
  it('creates public channels for everyone and private channels only the invited can see', async () => {
    const pub = Channel.parse((await http.post(`/api/nooks/${slug}/channels`).set(friend.auth).send({ name: 'Beta-Spray' }).expect(201)).body);
    expect(pub.name).toBe('beta-spray');
    expect(await prisma.channelMember.count({ where: { channelId: pub.id } })).toBeGreaterThanOrEqual(2);

    const priv = Channel.parse(
      (await http.post(`/api/nooks/${slug}/channels`).set(founder.auth).send({ name: 'route-setting', kind: 'private' }).expect(201)).body,
    );
    const friendView = NookDetail.parse((await http.get(`/api/nooks/${slug}`).set(friend.auth)).body);
    expect(friendView.channels.some((c) => c.id === priv.id)).toBe(false);

    await http.post(`/api/channels/${priv.id}/members`).set(founder.auth).send({ userIds: [friend.id] }).expect(200);
    const after = NookDetail.parse((await http.get(`/api/nooks/${slug}`).set(friend.auth)).body);
    expect(after.channels.some((c) => c.id === priv.id)).toBe(true);

    await http.post(`/api/channels/${priv.id}/members`).set(founder.auth).send({ userIds: [outsider.id] }).expect(404);
    const dup = await http.post(`/api/nooks/${slug}/channels`).set(founder.auth).send({ name: 'beta-spray' }).expect(409);
    expect(dup.body.message).toMatch(/already a #beta-spray/);
  });
});

describe('direct messages', () => {
  it('opens one channel per pair, from either side, even when both open at once', async () => {
    const [a, b] = await Promise.all([
      http.post(`/api/nooks/${slug}/directs`).set(founder.auth).send({ userId: friend.id }),
      http.post(`/api/nooks/${slug}/directs`).set(friend.auth).send({ userId: founder.id }),
    ]);
    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 201]);
    const fromFounder = Channel.parse(a.body);
    const fromFriend = Channel.parse(b.body);
    expect(fromFounder.id).toBe(fromFriend.id);
    expect(fromFounder.kind).toBe('direct');
    expect(fromFounder.dmUser?.id).toBe(friend.id);
    expect(fromFriend.dmUser?.id).toBe(founder.id);

    const again = await http.post(`/api/nooks/${slug}/directs`).set(founder.auth).send({ userId: friend.id }).expect(200);
    expect(again.body.id).toBe(fromFounder.id);
    expect(await prisma.channelMember.count({ where: { channelId: fromFounder.id } })).toBe(2);
  });

  it('refuses DMs with yourself or with people outside the nook', async () => {
    await http.post(`/api/nooks/${slug}/directs`).set(founder.auth).send({ userId: founder.id }).expect(409);
    await http.post(`/api/nooks/${slug}/directs`).set(founder.auth).send({ userId: outsider.id }).expect(404);
  });
});
