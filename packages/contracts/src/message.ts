import { z } from 'zod';
import { CursorPage, Emoji, Id, IsoDate } from './common.js';

export const MESSAGE_MAX_LENGTH = 4000;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;

/** What may be uploaded. Images get thumbnails; everything else is offered as a download. */
export const UPLOAD_TYPES = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'application/pdf': 'file',
  'text/plain': 'file',
  'application/zip': 'file',
  'audio/mpeg': 'file',
} as const;
export type UploadMime = keyof typeof UPLOAD_TYPES;

export const AttachmentStatus = z.enum(['pending', 'ready', 'failed']);

export const Attachment = z.object({
  id: Id,
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  status: AttachmentStatus,
  /** Signed, time-limited URLs: the bucket itself is private. */
  url: z.url(),
  thumbUrl: z.url().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});
export type Attachment = z.infer<typeof Attachment>;

export const CreateUpload = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(Object.keys(UPLOAD_TYPES) as [UploadMime, ...UploadMime[]], { error: 'That type of file can’t be shared here' }),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_UPLOAD_BYTES, `Files can be up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`),
});
export type CreateUpload = z.infer<typeof CreateUpload>;

/** Where the browser PUTs the file itself: straight to storage, never through the api. */
export const UploadTicket = z.object({
  attachmentId: Id,
  uploadUrl: z.url(),
  headers: z.record(z.string(), z.string()),
  expiresAt: IsoDate,
});
export type UploadTicket = z.infer<typeof UploadTicket>;

export const LinkPreview = z.object({
  url: z.url(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  imageUrl: z.url().nullable(),
  siteName: z.string().nullable(),
});
export type LinkPreview = z.infer<typeof LinkPreview>;

export const ReactionSummary = z.object({
  emoji: Emoji,
  count: z.number().int().positive(),
  /** Who reacted, earliest first. The client derives "reacted by me" from this. */
  userIds: z.array(Id),
});
export type ReactionSummary = z.infer<typeof ReactionSummary>;

/** System lines (joins, pins, invites) print into the transcript like any other message. */
export const MessageKind = z.enum(['user', 'system']);

/** For system messages, `body` is one of these keys and `authorId` is the person it's about. */
export const SystemEvent = z.enum(['member_joined', 'channel_created']);
export type SystemEvent = z.infer<typeof SystemEvent>;

export const Message = z.object({
  id: Id,
  channelId: Id,
  authorId: Id.nullable(),
  kind: MessageKind,
  body: z.string().max(MESSAGE_MAX_LENGTH),
  threadRootId: Id.nullable(),
  replyCount: z.number().int().nonnegative(),
  lastReplyAt: IsoDate.nullable(),
  /** Up to three most recent distinct repliers, newest first, for the thread summary. */
  replyAuthorIds: z.array(Id),
  reactions: z.array(ReactionSummary),
  attachments: z.array(Attachment),
  linkPreviews: z.array(LinkPreview),
  /** People this message @mentions and who can see it (members of the channel), resolved by the server. */
  mentions: z.array(Id),
  createdAt: IsoDate,
  editedAt: IsoDate.nullable(),
  deletedAt: IsoDate.nullable(),
  /** Echoed back to the sender only, so its optimistic copy can be matched to the saved message. */
  clientId: z.uuid().nullable(),
});
export type Message = z.infer<typeof Message>;

/**
 * An @handle: not glued to a word or another @ in front (so emails don't count), and ending where
 * the handle ends. Case-insensitive, since people type "@Mara" too.
 */
export const MENTION = /(?<![\w@])@([a-z0-9_]{2,24})(?![\w])/gi;

/** Code blocks and inline code are shown literally, so an @ inside them is not a mention. */
const CODE = /```[\s\S]*?```|`[^`\n]+`/g;

/** The distinct handles a message mentions, lowercased, in order of first appearance. */
export function mentionedHandles(body: string): string[] {
  const text = body.replace(CODE, ' ');
  return [...new Set(Array.from(text.matchAll(MENTION), (m) => m[1]!.toLowerCase()))];
}

export const MessageBody = z.string().trim().min(1, 'Write something first').max(MESSAGE_MAX_LENGTH, `Keep it under ${MESSAGE_MAX_LENGTH} characters`);

export const SendMessage = z
  .object({
    /** Any UUID the client picks. Retrying with the same one never creates a duplicate. */
    clientId: z.uuid(),
    channelId: Id,
    body: z.string().trim().max(MESSAGE_MAX_LENGTH, `Keep it under ${MESSAGE_MAX_LENGTH} characters`).default(''),
    threadRootId: Id.nullable().default(null),
    attachmentIds: z.array(Id).max(MAX_ATTACHMENTS).default([]),
  })
  .refine((m) => m.body.length > 0 || m.attachmentIds.length > 0, { message: 'Write something first', path: ['body'] });
export type SendMessage = z.infer<typeof SendMessage>;

export const EditMessage = z.object({ body: MessageBody });
export type EditMessage = z.infer<typeof EditMessage>;

export const ListMessages = CursorPage;

/** Oldest first within a page; `nextCursor` points further back in time. */
export const MessagePage = z.object({
  items: z.array(Message),
  nextCursor: Id.nullable(),
});
export type MessagePage = z.infer<typeof MessagePage>;
