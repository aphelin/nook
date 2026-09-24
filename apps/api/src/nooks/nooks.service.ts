import { randomBytes } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  Channel,
  CreateChannel,
  CreateInvite,
  CreateNook,
  Invite,
  InvitePreview,
  Nook,
  NookDetail,
  UpdateNook,
} from '@nook/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { MessagesService } from '../messages/messages.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService, rooms } from '../realtime/realtime.service.js';
import { toChannel, toInvite, toNook, toNookMember } from './nooks.mapper.js';

const withCount = { _count: { select: { members: true } } } as const;
const channelMembers = { members: { include: { user: true } } } as const;

/** Readable invite codes: no 0/O/1/l/I lookalikes. */
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
function inviteCode(length = 10): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Thrown inside the join transaction to roll back a use claimed by a duplicate request. */
class AlreadyMember {
  constructor(readonly nookId: string) {}
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

@Injectable()
export class NooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly messages: MessagesService,
  ) {}

  async listMine(userId: string): Promise<Nook[]> {
    const rows = await this.prisma.nook.findMany({
      where: { members: { some: { userId } } },
      include: withCount,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toNook);
  }

  async create(userId: string, input: CreateNook): Promise<NookDetail> {
    try {
      const nook = await this.prisma.nook.create({
        data: {
          slug: input.slug,
          name: input.name,
          description: input.description,
          kitField: input.kit.field.toLowerCase(),
          kitMark: input.kit.mark.toLowerCase(),
          ownerId: userId,
          members: { create: { userId } },
          channels: {
            create: {
              kind: 'public',
              name: 'general',
              topic: 'Everything and anything',
              createdById: userId,
              members: { create: { userId } },
            },
          },
        },
        include: { channels: { select: { id: true } } },
      });
      this.realtime.join([userId], [rooms.nook(nook.id), ...nook.channels.map((c) => rooms.channel(c.id))]);
      for (const c of nook.channels) await this.messages.system(c.id, userId, 'channel_created');
      return this.detail(nook.slug, userId);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('That address is taken. Try another.');
      throw err;
    }
  }

  async detail(slug: string, userId: string): Promise<NookDetail> {
    const nook = await this.requireMembership(slug, userId);
    const [channels, members] = await Promise.all([
      this.prisma.channel.findMany({
        where: {
          nookId: nook.id,
          OR: [{ kind: 'public' }, { members: { some: { userId } } }],
        },
        include: channelMembers,
        orderBy: [{ kind: 'asc' }, { name: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.nookMember.findMany({
        where: { nookId: nook.id },
        include: { user: true },
        orderBy: { joinedAt: 'asc' },
      }),
    ]);
    return {
      nook: toNook(nook),
      channels: channels.map((c) => toChannel(c, userId)),
      members: members.map((m) => toNookMember(m, nook.ownerId)),
    };
  }

  async update(slug: string, userId: string, input: UpdateNook): Promise<Nook> {
    const nook = await this.requireMembership(slug, userId);
    if (nook.ownerId !== userId) throw new ForbiddenException('Only the founder can change the nook’s details.');
    const updated = await this.prisma.nook.update({
      where: { id: nook.id },
      data: {
        name: input.name,
        description: input.description,
        kitField: input.kit?.field.toLowerCase(),
        kitMark: input.kit?.mark.toLowerCase(),
      },
      include: withCount,
    });
    return toNook(updated);
  }

  async createChannel(slug: string, userId: string, input: CreateChannel): Promise<Channel> {
    const nook = await this.requireMembership(slug, userId);
    // Public channels include everyone in the nook; private ones start with just the creator.
    const memberIds =
      input.kind === 'public'
        ? (await this.prisma.nookMember.findMany({ where: { nookId: nook.id }, select: { userId: true } })).map((m) => m.userId)
        : [userId];
    try {
      const channel = await this.prisma.channel.create({
        data: {
          nookId: nook.id,
          kind: input.kind,
          name: input.name,
          topic: input.topic,
          createdById: userId,
          members: { createMany: { data: memberIds.map((id) => ({ userId: id })) } },
        },
        include: channelMembers,
      });
      this.realtime.join(memberIds, rooms.channel(channel.id));
      this.realtime.emit(input.kind === 'public' ? rooms.nook(nook.id) : rooms.user(userId), 'nook:updated', { slug });
      // The first line of every channel is who opened it, printed like a team-sheet entry.
      await this.messages.system(channel.id, userId, 'channel_created');
      return toChannel(channel, userId);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException(`There’s already a #${input.name} here.`);
      throw err;
    }
  }

  async addChannelMembers(channelId: string, userId: string, userIds: string[]): Promise<Channel> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId }, include: channelMembers });
    if (!channel || !channel.members.some((m) => m.user.id === userId)) throw new NotFoundException('Channel not found');
    if (channel.kind !== 'private') throw new ConflictException('Only private channels take hand-picked members.');
    const eligible = await this.prisma.nookMember.findMany({
      where: { nookId: channel.nookId, userId: { in: userIds } },
      select: { userId: true },
    });
    if (eligible.length !== new Set(userIds).size) throw new NotFoundException('Everyone added must be in this nook.');
    await this.prisma.channelMember.createMany({
      data: eligible.map((m) => ({ channelId, userId: m.userId })),
      skipDuplicates: true,
    });
    const updated = await this.prisma.channel.findUniqueOrThrow({ where: { id: channelId }, include: { ...channelMembers, nook: true } });
    const added = eligible.map((m) => m.userId);
    this.realtime.join(added, rooms.channel(channelId));
    this.realtime.emit(added.map(rooms.user), 'nook:updated', { slug: updated.nook.slug });
    return toChannel(updated, userId);
  }

  /** One direct channel per pair of people per nook, created on first use. */
  async openDirect(slug: string, userId: string, otherId: string): Promise<{ channel: Channel; created: boolean }> {
    const nook = await this.requireMembership(slug, userId);
    if (otherId === userId) throw new ConflictException('Direct messages need someone else.');
    const other = await this.prisma.nookMember.findUnique({ where: { nookId_userId: { nookId: nook.id, userId: otherId } } });
    if (!other) throw new NotFoundException('That person isn’t in this nook.');

    const directKey = `${nook.id}:${[userId, otherId].sort().join(':')}`;
    const existing = await this.prisma.channel.findUnique({ where: { directKey }, include: channelMembers });
    if (existing) return { channel: toChannel(existing, userId), created: false };
    try {
      const channel = await this.prisma.channel.create({
        data: {
          nookId: nook.id,
          kind: 'direct',
          directKey,
          createdById: userId,
          members: { createMany: { data: [{ userId }, { userId: otherId }] } },
        },
        include: channelMembers,
      });
      this.realtime.join([userId, otherId], rooms.channel(channel.id));
      this.realtime.emit([rooms.user(userId), rooms.user(otherId)], 'nook:updated', { slug });
      return { channel: toChannel(channel, userId), created: true };
    } catch (err) {
      // Both people opened the DM at once: the other request won, so return its channel.
      if (!isUniqueViolation(err)) throw err;
      const raced = await this.prisma.channel.findUniqueOrThrow({ where: { directKey }, include: channelMembers });
      return { channel: toChannel(raced, userId), created: false };
    }
  }

  async createInvite(slug: string, userId: string, input: CreateInvite): Promise<Invite> {
    const nook = await this.requireMembership(slug, userId);
    const invite = await this.prisma.invite.create({
      data: {
        code: inviteCode(),
        nookId: nook.id,
        createdById: userId,
        maxUses: input.maxUses,
        expiresAt: input.expiresInHours ? new Date(Date.now() + input.expiresInHours * 3_600_000) : null,
      },
    });
    return toInvite(invite);
  }

  async listInvites(slug: string, userId: string): Promise<Invite[]> {
    const nook = await this.requireMembership(slug, userId);
    const invites = await this.prisma.invite.findMany({
      where: { nookId: nook.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { createdAt: 'desc' },
    });
    return invites.filter((i) => i.maxUses === null || i.uses < i.maxUses).map(toInvite);
  }

  async revokeInvite(code: string, userId: string): Promise<void> {
    const invite = await this.prisma.invite.findUnique({ where: { code }, include: { nook: true } });
    if (!invite || (invite.createdById !== userId && invite.nook.ownerId !== userId)) {
      throw new NotFoundException('Invite not found');
    }
    await this.prisma.invite.update({ where: { code }, data: { revokedAt: new Date() } });
  }

  async previewInvite(code: string): Promise<InvitePreview> {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: { nook: { include: withCount }, createdBy: true },
    });
    if (!invite) throw new NotFoundException('This invite link doesn’t exist. Ask for a fresh one.');
    const n = toNook(invite.nook);
    return {
      code,
      nook: { name: n.name, slug: n.slug, description: n.description, kit: n.kit, crestUrl: n.crestUrl, memberCount: n.memberCount },
      invitedBy: { displayName: invite.createdBy.displayName, handle: invite.createdBy.handle },
      status: invite.revokedAt
        ? 'revoked'
        : invite.expiresAt && invite.expiresAt <= new Date()
          ? 'expired'
          : invite.maxUses !== null && invite.uses >= invite.maxUses
            ? 'used_up'
            : 'valid',
    };
  }

  /**
   * Joins a nook through an invite. The use counter is claimed with one conditional UPDATE,
   * so a link limited to N uses admits exactly N people even under concurrent clicks.
   */
  async acceptInvite(code: string, userId: string): Promise<Nook> {
    let joinedNow = false;
    const nookId = await this.prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findUnique({ where: { code } });
      if (!invite) throw new NotFoundException('This invite link doesn’t exist. Ask for a fresh one.');
      const already = await tx.nookMember.findUnique({ where: { nookId_userId: { nookId: invite.nookId, userId } } });
      if (already) return invite.nookId;

      const claimed = await tx.$queryRaw<{ nookId: string }[]>`
        UPDATE "Invite" SET "uses" = "uses" + 1
        WHERE "code" = ${code}
          AND "revokedAt" IS NULL
          AND ("expiresAt" IS NULL OR "expiresAt" > now())
          AND ("maxUses" IS NULL OR "uses" < "maxUses")
        RETURNING "nookId"`;
      if (claimed.length === 0) throw new ConflictException('This invite has expired or been used up. Ask for a fresh one.');

      // A double-click races two joins past the check above; the loser rolls back its claimed use.
      const inserted = await tx.nookMember.createMany({ data: [{ nookId: invite.nookId, userId }], skipDuplicates: true });
      if (inserted.count === 0) throw new AlreadyMember(invite.nookId);
      const publicChannels = await tx.channel.findMany({ where: { nookId: invite.nookId, kind: 'public' }, select: { id: true } });
      await tx.channelMember.createMany({
        data: publicChannels.map((c) => ({ channelId: c.id, userId })),
        skipDuplicates: true,
      });
      joinedNow = true;
      return invite.nookId;
    }).catch((err: unknown) => {
      if (err instanceof AlreadyMember) return err.nookId;
      throw err;
    });
    const nook = await this.prisma.nook.findUniqueOrThrow({ where: { id: nookId }, include: withCount });
    if (joinedNow) await this.announceJoin(nook.id, nook.slug, userId);
    return toNook(nook);
  }

  /** Puts a new member's live sockets in the nook's rooms, tells everyone, and prints the join line in #general. */
  private async announceJoin(nookId: string, slug: string, userId: string) {
    const publicChannels = await this.prisma.channel.findMany({ where: { nookId, kind: 'public' }, select: { id: true, name: true } });
    this.realtime.join([userId], [rooms.nook(nookId), ...publicChannels.map((c) => rooms.channel(c.id))]);
    this.realtime.emit(rooms.nook(nookId), 'nook:updated', { slug });
    const general = publicChannels.find((c) => c.name === 'general');
    if (general) await this.messages.system(general.id, userId, 'member_joined');
  }

  /** Non-members get a 404, so a nook's existence doesn't leak. */
  private async requireMembership(slug: string, userId: string) {
    const nook = await this.prisma.nook.findFirst({
      where: { slug, members: { some: { userId } } },
      include: withCount,
    });
    if (!nook) throw new NotFoundException('Nook not found');
    return nook;
  }
}
