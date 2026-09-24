import { Injectable } from '@nestjs/common';
import type { Attachment, Message, ReactionSummary } from '@nook/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { toAttachment } from '../uploads/attachments.js';
import { type Hydration, type MessageColumns, toMessage } from './messages.mapper.js';

// Only the columns the Message contract needs; the generated tsvector stays in the database.
export const messageColumns = {
  id: true,
  channelId: true,
  authorId: true,
  kind: true,
  body: true,
  threadRootId: true,
  replyCount: true,
  lastReplyAt: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  clientId: true,
} as const;

/** Turns message rows into full Message payloads, loading everything attached to a batch at once. */
@Injectable()
export class MessageHydrator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async hydrate(rows: MessageColumns[]): Promise<Message[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const roots = rows.filter((r) => r.replyCount > 0).map((r) => r.id);
    const [reactions, repliers, attachments, previews, mentions] = await Promise.all([
      this.prisma.reaction.findMany({
        where: { messageId: { in: ids } },
        orderBy: { createdAt: 'asc' },
        select: { messageId: true, emoji: true, userId: true },
      }),
      roots.length
        ? this.prisma.$queryRaw<{ threadRootId: string; authorId: string }[]>`
            SELECT "threadRootId", "authorId" FROM "Message"
            WHERE "threadRootId" = ANY(${roots}::uuid[]) AND "deletedAt" IS NULL AND "authorId" IS NOT NULL
            GROUP BY "threadRootId", "authorId"
            ORDER BY max("createdAt") DESC`
        : Promise.resolve([]),
      this.prisma.attachment.findMany({ where: { messageId: { in: ids } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.linkPreview.findMany({ where: { messageId: { in: ids } }, orderBy: { fetchedAt: 'asc' } }),
      this.prisma.mention.findMany({ where: { messageId: { in: ids } }, select: { messageId: true, userId: true } }),
    ]);
    const signed = await Promise.all(attachments.map((a) => toAttachment(a, this.storage)));

    const extras = new Map<string, Hydration>(
      ids.map((id) => [id, { reactions: [], replyAuthorIds: [], attachments: [], linkPreviews: [], mentions: [] }]),
    );
    attachments.forEach((a, i) => extras.get(a.messageId!)!.attachments.push(signed[i] as Attachment));
    for (const p of previews) {
      extras
        .get(p.messageId)!
        .linkPreviews.push({ url: p.url, title: p.title, description: p.description, imageUrl: p.imageUrl, siteName: p.siteName });
    }
    for (const r of reactions) {
      const list = extras.get(r.messageId)!.reactions;
      let summary: ReactionSummary | undefined = list.find((s) => s.emoji === r.emoji);
      if (!summary) list.push((summary = { emoji: r.emoji, count: 0, userIds: [] }));
      summary.count++;
      summary.userIds.push(r.userId);
    }
    for (const r of repliers) {
      const recent = extras.get(r.threadRootId)!.replyAuthorIds;
      if (recent.length < 3) recent.push(r.authorId);
    }
    for (const m of mentions) extras.get(m.messageId)!.mentions.push(m.userId);
    return rows.map((row) => toMessage(row, extras.get(row.id)));
  }
}
