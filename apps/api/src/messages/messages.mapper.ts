import type { Attachment, LinkPreview, Message, ReactionSummary } from '@nook/contracts';
import type { Message as MessageRow } from '../generated/prisma/client.js';

export type MessageColumns = Pick<
  MessageRow,
  'id' | 'channelId' | 'authorId' | 'kind' | 'body' | 'threadRootId' | 'replyCount' | 'lastReplyAt' | 'createdAt' | 'editedAt' | 'deletedAt' | 'clientId'
>;

export interface Hydration {
  reactions: ReactionSummary[];
  replyAuthorIds: string[];
  attachments: Attachment[];
  linkPreviews: LinkPreview[];
  mentions: string[];
}

const EMPTY: Hydration = { reactions: [], replyAuthorIds: [], attachments: [], linkPreviews: [], mentions: [] };

export function toMessage(m: MessageColumns, extra: Hydration = EMPTY): Message {
  const deleted = !!m.deletedAt;
  return {
    id: m.id,
    channelId: m.channelId,
    authorId: m.authorId,
    kind: m.kind,
    body: deleted ? '' : m.body,
    threadRootId: m.threadRootId,
    replyCount: m.replyCount,
    lastReplyAt: m.lastReplyAt?.toISOString() ?? null,
    replyAuthorIds: extra.replyAuthorIds,
    reactions: deleted ? [] : extra.reactions,
    attachments: deleted ? [] : extra.attachments,
    linkPreviews: deleted ? [] : extra.linkPreviews,
    mentions: deleted ? [] : extra.mentions,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    deletedAt: m.deletedAt?.toISOString() ?? null,
    clientId: m.clientId,
  };
}
