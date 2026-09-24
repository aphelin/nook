import { z } from 'zod';
import { Id } from './common.js';
import { Message, SendMessage } from './message.js';
import { Notification } from './notification.js';
import { PresenceState, PublicUser } from './user.js';

/** Client → server events, each validated by the gateway with its schema. */
export const ClientEvents = {
  'message:send': SendMessage,
  'typing:start': z.object({ channelId: Id }),
  /** A status you choose: "online" clears any manual away / do-not-disturb. */
  'presence:set': z.object({ state: z.enum(['online', 'away', 'dnd']) }),
  /** This tab has gone idle (no input for a while, or hidden) or come back. */
  'presence:idle': z.object({ idle: z.boolean() }),
} as const;

/** Server → client events. */
export const ServerEvents = {
  /** Rooms joined and presence registered: from here on no event for this user is missed. */
  'session:ready': z.object({ status: z.enum(['online', 'away', 'dnd']) }),
  'message:new': Message,
  /** Edits and deletions (a deleted message arrives with `deletedAt` set and an empty body). */
  'message:updated': Message,
  /** Something about a nook changed for this user (new channel, new member): refetch it. */
  'nook:updated': z.object({ slug: z.string() }),
  /** Someone mentioned you or replied in your thread. */
  'notification:new': Notification,
  /** Your unread counts or inbox changed elsewhere (another tab read something, a mention was deleted): refetch them. */
  'unread:changed': z.object({}),
  /** Someone who shares a nook with you changed their profile. */
  'user:updated': PublicUser,
  typing: z.object({ channelId: Id, userId: Id }),
  presence: z.object({ userId: Id, state: PresenceState }),
} as const;

export type ClientEventName = keyof typeof ClientEvents;
export type ServerEventName = keyof typeof ServerEvents;
export type ClientEventPayload<E extends ClientEventName> = z.infer<(typeof ClientEvents)[E]>;
export type ServerEventPayload<E extends ServerEventName> = z.infer<(typeof ServerEvents)[E]>;

export type Ack<T> = { ok: true; data: T } | { ok: false; error: string };
