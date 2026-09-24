import { z } from 'zod';
import { Id, IsoDate } from './common.js';
import { Message } from './message.js';
import { Channel, ChannelKind, Nook } from './nook.js';
import { PublicUser } from './user.js';

export const NotificationKind = z.enum(['mention', 'reply']);
export type NotificationKind = z.infer<typeof NotificationKind>;

/** One inbox item: enough to render it and jump to it, from any nook. */
export const Notification = z.object({
  id: Id,
  kind: NotificationKind,
  createdAt: IsoDate,
  readAt: IsoDate.nullable(),
  actor: PublicUser.nullable(),
  message: Message,
  channel: Channel.pick({ id: true, kind: true, name: true }),
  nook: Nook.pick({ id: true, slug: true, name: true, kit: true }),
});
export type Notification = z.infer<typeof Notification>;

/** Newest first; `nextCursor` points further back. */
export const NotificationPage = z.object({ items: z.array(Notification), nextCursor: Id.nullable() });
export type NotificationPage = z.infer<typeof NotificationPage>;

export const ListNotifications = z.object({ before: Id.optional(), limit: z.coerce.number().int().min(1).max(50).default(30) });

/** Mark some, one thread's, or all of your notifications read. */
export const MarkNotificationsRead = z.union([
  z.object({ ids: z.array(Id).min(1).max(100) }),
  z.object({ threadRootId: Id }),
  z.object({ all: z.literal(true) }),
]);
export type MarkNotificationsRead = z.infer<typeof MarkNotificationsRead>;

/** Counts stop at this many; the interface shows "999+". */
export const UNREAD_CAP = 1000;

export const ChannelUnread = z.object({
  channelId: Id,
  nookId: Id,
  /** Every message in a direct channel is for you, so those count like mentions. */
  kind: ChannelKind,
  /** Top-level messages from other people after your read pointer. */
  unread: z.number().int().nonnegative(),
  /** Of those, the ones that mention you. */
  mentions: z.number().int().nonnegative(),
  /** Where you left off: the "new messages" line goes after it. Null until you first read the channel. */
  lastReadId: Id.nullable(),
});
export type ChannelUnread = z.infer<typeof ChannelUnread>;

export const UnreadState = z.object({
  channels: z.array(ChannelUnread),
  /** Unread notifications. */
  inbox: z.number().int().nonnegative(),
});
export type UnreadState = z.infer<typeof UnreadState>;

export const ReadChannel = z.object({ messageId: Id });
export type ReadChannel = z.infer<typeof ReadChannel>;
