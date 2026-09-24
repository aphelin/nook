import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Message, MessagePage, SendMessage, SystemEvent } from '@nook/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { type NotificationChanges, NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JobsService } from '../queue/jobs.service.js';
import { RealtimeService, rooms } from '../realtime/realtime.service.js';
import { extractUrls } from '../unfurl/urls.js';
import { MessageHydrator, messageColumns } from './hydrator.js';
import { type MessageColumns, toMessage } from './messages.mapper.js';

const MAX_DISTINCT_REACTIONS = 20;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly hydrator: MessageHydrator,
    private readonly notifications: NotificationsService,
    private readonly jobs: JobsService,
  ) {}

  /** Top-level messages, newest page first in time order; `before` walks further back. UUIDv7: id order is time order. */
  async list(channelId: string, userId: string, page: { before?: string; limit: number }): Promise<MessagePage> {
    await this.requireMember(channelId, userId);
    return this.page({ channelId, threadRootId: null }, page);
  }

  /** A thread's replies, paged the same way. */
  async replies(rootId: string, userId: string, page: { before?: string; limit: number }): Promise<MessagePage> {
    const root = await this.prisma.message.findUnique({ where: { id: rootId }, select: messageColumns });
    if (!root) throw new NotFoundException('Message not found');
    await this.requireMember(root.channelId, userId);
    return this.page({ threadRootId: rootId }, page);
  }

  async get(messageId: string, userId: string): Promise<Message> {
    const row = await this.prisma.message.findUnique({ where: { id: messageId }, select: messageColumns });
    if (!row) throw new NotFoundException('Message not found');
    await this.requireMember(row.channelId, userId);
    return (await this.hydrator.hydrate([row]))[0]!;
  }

  /** Saves and broadcasts a message. Re-sending the same clientId returns the original instead of a duplicate. */
  async send(userId: string, input: SendMessage): Promise<Message> {
    await this.requireMember(input.channelId, userId);
    if (input.threadRootId) await this.requireThreadRoot(input.threadRootId, input.channelId);
    let row: MessageColumns;
    let changes: NotificationChanges;
    try {
      [row, changes] = await this.prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: { channelId: input.channelId, authorId: userId, body: input.body, clientId: input.clientId, threadRootId: input.threadRootId },
          select: messageColumns,
        });
        if (input.attachmentIds.length) {
          // Only your own uploads, not yet sent, not failed: claimed atomically with the message.
          const claimed = await tx.attachment.updateMany({
            where: { id: { in: input.attachmentIds }, uploaderId: userId, messageId: null, status: { not: 'failed' } },
            data: { messageId: created.id },
          });
          if (claimed.count !== new Set(input.attachmentIds).size) throw new NotFoundException('One of those files isn’t available to send.');
        }
        if (input.threadRootId) {
          await tx.message.update({
            where: { id: input.threadRootId },
            data: { replyCount: { increment: 1 }, lastReplyAt: created.createdAt },
          });
        }
        return [created, await this.notifications.record(tx, created, { isNew: true })] as const;
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      const original = await this.prisma.message.findUniqueOrThrow({
        where: { authorId_clientId: { authorId: userId, clientId: input.clientId } },
        select: messageColumns,
      });
      return (await this.hydrator.hydrate([original]))[0]!;
    }
    const [message] = await this.hydrator.hydrate([row]);
    this.realtime.emit(rooms.channel(input.channelId), 'message:new', message!);
    await this.notifications.publish(changes);
    if (input.threadRootId) await this.broadcastUpdated(input.threadRootId);
    if (extractUrls(input.body).length) await this.jobs.enqueue('unfurl', { messageId: row.id });
    return message!;
  }

  async edit(messageId: string, userId: string, body: string): Promise<Message> {
    const message = await this.requireOwn(messageId, userId);
    const changes = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.message.update({ where: { id: message.id }, data: { body, editedAt: new Date() }, select: messageColumns });
      return this.notifications.record(tx, saved, { isNew: false });
    });
    const updated = await this.broadcastUpdated(message.id);
    await this.notifications.publish(changes);
    if (extractUrls(body).length) await this.jobs.enqueue('unfurl', { messageId: message.id });
    return updated;
  }

  async remove(messageId: string, userId: string): Promise<void> {
    const message = await this.requireOwn(messageId, userId);
    const changes = await this.prisma.$transaction(async (tx) => {
      await tx.message.update({ where: { id: message.id }, data: { deletedAt: new Date(), body: '' } });
      await tx.reaction.deleteMany({ where: { messageId: message.id } });
      if (message.threadRootId) {
        await tx.message.updateMany({ where: { id: message.threadRootId, replyCount: { gt: 0 } }, data: { replyCount: { decrement: 1 } } });
      }
      return this.notifications.forget(tx, message.id);
    });
    await this.broadcastUpdated(message.id);
    await this.notifications.publish(changes);
    if (message.threadRootId) await this.broadcastUpdated(message.threadRootId);
  }

  async react(messageId: string, userId: string, emoji: string, add: boolean): Promise<Message> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId }, select: messageColumns });
    if (!message || message.deletedAt || message.kind !== 'user') throw new NotFoundException('Message not found');
    await this.requireMember(message.channelId, userId);
    if (add) {
      const distinct = await this.prisma.reaction.findMany({ where: { messageId }, distinct: ['emoji'], select: { emoji: true } });
      if (!distinct.some((r) => r.emoji === emoji) && distinct.length >= MAX_DISTINCT_REACTIONS) {
        throw new BadRequestException(`A message can hold ${MAX_DISTINCT_REACTIONS} different reactions.`);
      }
      await this.prisma.reaction.createMany({ data: [{ messageId, userId, emoji }], skipDuplicates: true });
    } else {
      await this.prisma.reaction.deleteMany({ where: { messageId, userId, emoji } });
    }
    return this.broadcastUpdated(messageId);
  }

  /** A team-sheet line in the transcript, e.g. "Kai joined the nook". */
  async system(channelId: string, subjectUserId: string, event: SystemEvent): Promise<Message> {
    const row = await this.prisma.message.create({
      data: { channelId, authorId: subjectUserId, kind: 'system', body: event },
      select: messageColumns,
    });
    const message = toMessage(row);
    this.realtime.emit(rooms.channel(channelId), 'message:new', message);
    return message;
  }

  private async page(where: Prisma.MessageWhereInput, page: { before?: string; limit: number }): Promise<MessagePage> {
    const rows = await this.prisma.message.findMany({
      where: { ...where, ...(page.before ? { id: { lt: page.before } } : {}) },
      orderBy: { id: 'desc' },
      take: page.limit + 1,
      select: messageColumns,
    });
    const hasMore = rows.length > page.limit;
    const items = rows.slice(0, page.limit).reverse();
    return { items: await this.hydrator.hydrate(items), nextCursor: hasMore ? (items[0]?.id ?? null) : null };
  }

  /** Re-reads a message and pushes it to its channel (also used by the worker after thumbnails and unfurls). */
  async broadcastUpdated(messageId: string): Promise<Message> {
    const row = await this.prisma.message.findUniqueOrThrow({ where: { id: messageId }, select: messageColumns });
    const [message] = await this.hydrator.hydrate([row]);
    this.realtime.emit(rooms.channel(row.channelId), 'message:updated', message!);
    return message!;
  }

  private async requireThreadRoot(rootId: string, channelId: string) {
    const root = await this.prisma.message.findUnique({ where: { id: rootId }, select: messageColumns });
    if (!root || root.channelId !== channelId) throw new NotFoundException('That thread isn’t in this channel.');
    if (root.threadRootId) throw new BadRequestException('Replies stay one level deep: reply to the thread instead.');
    if (root.deletedAt || root.kind !== 'user') throw new BadRequestException('That message can’t take replies.');
  }

  private async requireMember(channelId: string, userId: string) {
    const member = await this.prisma.channelMember.findUnique({ where: { channelId_userId: { channelId, userId } } });
    if (!member) throw new NotFoundException('Channel not found');
  }

  private async requireOwn(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId }, select: messageColumns });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');
    await this.requireMember(message.channelId, userId);
    if (message.authorId !== userId || message.kind !== 'user') throw new ForbiddenException('You can only change your own messages.');
    return message;
  }
}
