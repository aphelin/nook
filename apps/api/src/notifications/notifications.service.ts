import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type ChannelUnread,
  type MarkNotificationsRead,
  mentionedHandles,
  type Notification,
  type NotificationPage,
  UNREAD_CAP,
  type UnreadState,
} from '@nook/contracts';
import type { Prisma } from '../generated/prisma/client.js';
import { MessageHydrator, messageColumns } from '../messages/hydrator.js';
import type { MessageColumns } from '../messages/messages.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService, rooms } from '../realtime/realtime.service.js';
import { toPublicUser } from '../users/users.mapper.js';

type Tx = Prisma.TransactionClient;

/** Who was newly notified by a write, and whose inbox lost something. Published after the transaction commits. */
export interface NotificationChanges {
  created: string[];
  touchedUserIds: string[];
}

const NONE: NotificationChanges = { created: [], touchedUserIds: [] };

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly hydrator: MessageHydrator,
  ) {}

  /**
   * Inside the transaction that saves or edits a message: stores who it mentions and notifies them,
   * and on a new thread reply, notifies the root's author and everyone who replied before.
   * Only members of the channel count: a mention can't reach someone who can't read it.
   */
  async record(tx: Tx, message: MessageColumns, { isNew }: { isNew: boolean }): Promise<NotificationChanges> {
    if (message.kind !== 'user' || !message.authorId) return NONE;
    const authorId = message.authorId;
    const handles = mentionedHandles(message.body);
    const mentioned = handles.length
      ? (
          await tx.user.findMany({
            where: { handle: { in: handles }, id: { not: authorId }, channelMembers: { some: { channelId: message.channelId } } },
            select: { id: true },
          })
        ).map((u) => u.id)
      : [];

    const previous = isNew
      ? []
      : (await tx.mention.findMany({ where: { messageId: message.id }, select: { userId: true } })).map((m) => m.userId);
    const added = mentioned.filter((id) => !previous.includes(id));
    const removed = previous.filter((id) => !mentioned.includes(id));

    if (removed.length) {
      await tx.mention.deleteMany({ where: { messageId: message.id, userId: { in: removed } } });
      await tx.notification.deleteMany({ where: { messageId: message.id, kind: 'mention', userId: { in: removed } } });
    }
    if (added.length)
      await tx.mention.createMany({ data: added.map((userId) => ({ messageId: message.id, userId })), skipDuplicates: true });

    // Thread participants hear about new replies; anyone mentioned in the reply already gets a mention instead.
    let repliedTo: string[] = [];
    if (isNew && message.threadRootId) {
      const participants = await tx.message.findMany({
        where: { OR: [{ id: message.threadRootId }, { threadRootId: message.threadRootId }], kind: 'user', authorId: { not: null } },
        distinct: ['authorId'],
        select: { authorId: true },
      });
      const candidates = participants.map((p) => p.authorId!).filter((id) => id !== authorId && !mentioned.includes(id));
      repliedTo = candidates.length
        ? (
            await tx.channelMember.findMany({
              where: { channelId: message.channelId, userId: { in: candidates } },
              select: { userId: true },
            })
          ).map((m) => m.userId)
        : [];
    }

    const rows = [
      ...added.map((userId) => ({ userId, actorId: authorId, kind: 'mention' as const, messageId: message.id })),
      ...repliedTo.map((userId) => ({ userId, actorId: authorId, kind: 'reply' as const, messageId: message.id })),
    ];
    const created = rows.length ? (await tx.notification.createManyAndReturn({ data: rows, select: { id: true } })).map((n) => n.id) : [];
    return { created, touchedUserIds: removed };
  }

  /** Inside the transaction that deletes a message: its mentions and notifications go with it. */
  async forget(tx: Tx, messageId: string): Promise<NotificationChanges> {
    const gone = await tx.notification.findMany({ where: { messageId }, select: { userId: true } });
    await tx.notification.deleteMany({ where: { messageId } });
    await tx.mention.deleteMany({ where: { messageId } });
    return { created: [], touchedUserIds: [...new Set(gone.map((n) => n.userId))] };
  }

  /** After commit: new notifications go to their recipients live, and changed inboxes are told to refresh. */
  async publish(changes: NotificationChanges) {
    if (changes.touchedUserIds.length) this.realtime.emit(changes.touchedUserIds.map(rooms.user), 'unread:changed', {});
    if (!changes.created.length) return;
    for (const n of await this.load({ id: { in: changes.created } })) {
      this.realtime.emit(rooms.user(n.userId), 'notification:new', n.payload);
    }
  }

  /** Your inbox, newest first. Deleted messages and channels you've left drop out. */
  async list(userId: string, page: { before?: string; limit: number }): Promise<NotificationPage> {
    const found = await this.load({ ...this.visibleTo(userId), ...(page.before ? { id: { lt: page.before } } : {}) }, page.limit + 1);
    const items = found.slice(0, page.limit).map((n) => n.payload);
    return { items, nextCursor: found.length > page.limit ? (items.at(-1)?.id ?? null) : null };
  }

  async markRead(userId: string, input: MarkNotificationsRead) {
    const which: Prisma.NotificationWhereInput =
      'ids' in input ? { id: { in: input.ids } } : 'threadRootId' in input ? { message: { threadRootId: input.threadRootId } } : {};
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...which },
      data: { readAt: new Date() },
    });
    if (count) this.realtime.emit(rooms.user(userId), 'unread:changed', {});
  }

  /**
   * Moves your read pointer in a channel forward to a message in it (never back), and marks the
   * mentions you've now seen as read. Every tab of yours hears about it.
   */
  async readChannel(userId: string, channelId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId }, select: { channelId: true } });
    const member = await this.prisma.channelMember.findUnique({ where: { channelId_userId: { channelId, userId } } });
    if (!member || !message || message.channelId !== channelId) throw new NotFoundException('Message not found');
    const [moved, seen] = await this.prisma.$transaction([
      this.prisma.channelMember.updateMany({
        where: { channelId, userId, OR: [{ lastReadMessageId: null }, { lastReadMessageId: { lt: messageId } }] },
        data: { lastReadMessageId: messageId },
      }),
      this.prisma.notification.updateMany({
        where: { userId, readAt: null, kind: 'mention', message: { channelId, threadRootId: null, id: { lte: messageId } } },
        data: { readAt: new Date() },
      }),
    ]);
    if (moved.count || seen.count) this.realtime.emit(rooms.user(userId), 'unread:changed', {});
  }

  /**
   * Unread and mention counts for every channel you're in, plus your unread inbox count.
   * Before you first read a channel, only what arrived after you joined counts.
   */
  async unread(userId: string): Promise<UnreadState> {
    const after = (m: string) =>
      `(CASE WHEN cm."lastReadMessageId" IS NULL THEN ${m}."createdAt" > cm."joinedAt" ELSE ${m}.id > cm."lastReadMessageId" END)`;
    const [channels, inbox] = await Promise.all([
      this.prisma.$queryRawUnsafe<ChannelUnread[]>(
        `SELECT cm."channelId", c."nookId", c.kind::text AS kind, cm."lastReadMessageId" AS "lastReadId",
           (SELECT count(*)::int FROM (
              SELECT 1 FROM "Message" m
              WHERE m."channelId" = cm."channelId" AND m."threadRootId" IS NULL AND m."deletedAt" IS NULL
                AND m.kind = 'user' AND m."authorId" <> $1::uuid AND ${after('m')}
              LIMIT ${UNREAD_CAP}) s) AS unread,
           (SELECT count(*)::int FROM (
              SELECT 1 FROM "Mention" x JOIN "Message" m ON m.id = x."messageId"
              WHERE x."userId" = $1::uuid AND m."channelId" = cm."channelId" AND m."threadRootId" IS NULL
                AND m."deletedAt" IS NULL AND ${after('m')}
              LIMIT ${UNREAD_CAP}) s) AS mentions
         FROM "ChannelMember" cm JOIN "Channel" c ON c.id = cm."channelId"
         WHERE cm."userId" = $1::uuid`,
        userId,
      ),
      this.prisma.notification.count({ where: { ...this.visibleTo(userId), readAt: null } }),
    ]);
    return { channels, inbox: Math.min(inbox, UNREAD_CAP) };
  }

  /** Yours, on messages that still exist, in channels you can still read. */
  private visibleTo(userId: string): Prisma.NotificationWhereInput {
    return { userId, message: { deletedAt: null, channel: { members: { some: { userId } } } } };
  }

  private async load(where: Prisma.NotificationWhereInput, take?: number) {
    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: { id: 'desc' },
      take,
      include: {
        actor: true,
        message: { select: { ...messageColumns, channel: { select: { id: true, kind: true, name: true, nook: true } } } },
      },
    });
    const withMessage = rows.filter((n) => n.message);
    const messages = await this.hydrator.hydrate(withMessage.map((n) => n.message!));
    return withMessage.map((n, i) => {
      const { channel } = n.message!;
      const payload: Notification = {
        id: n.id,
        kind: n.kind,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString() ?? null,
        actor: n.actor ? toPublicUser(n.actor) : null,
        message: messages[i]!,
        channel: { id: channel.id, kind: channel.kind, name: channel.name },
        nook: {
          id: channel.nook.id,
          slug: channel.nook.slug,
          name: channel.nook.name,
          kit: { field: channel.nook.kitField, mark: channel.nook.kitMark },
        },
      };
      return { userId: n.userId, payload };
    });
  }
}
