import { Injectable } from '@nestjs/common';
import { parseSearch, type SearchHit, type SearchQuery, type SearchResults } from '@nook/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { MessageHydrator, messageColumns } from '../messages/hydrator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toPublicUser } from '../users/users.mapper.js';

/**
 * Full-text search over message bodies. `Message.search` is a generated tsvector with a GIN index,
 * so Postgres keeps it current on every insert and edit. Results are newest first, not ranked: in
 * a chat, the recent message is almost always the one you're after.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hydrator: MessageHydrator,
  ) {}

  async search(userId: string, query: SearchQuery): Promise<SearchResults> {
    const parsed = parseSearch(query.q);
    // Something has to narrow it down: a word, or a filter. Exclusions alone would match everything.
    if (!parsed.terms.length && !parsed.in && !parsed.from) return { items: [], nextCursor: null };

    // Words are letters, digits and underscores only (see parseSearch), so they're safe as lexemes.
    const tsquery = [...parsed.terms.map((t) => `${t}:*`), ...parsed.excluded.map((t) => `!${t}`)].join(' & ');
    const conditions = [
      Prisma.sql`m."deletedAt" IS NULL`,
      Prisma.sql`m.kind = 'user'`,
      ...(parsed.terms.length || parsed.excluded.length ? [Prisma.sql`m.search @@ to_tsquery('simple', ${tsquery})`] : []),
      ...(query.nook ? [Prisma.sql`n.slug = ${query.nook}`] : []),
      ...(parsed.in ? [Prisma.sql`c.name = ${parsed.in}`] : []),
      ...(parsed.from ? [Prisma.sql`u.handle = ${parsed.from}`] : []),
      ...(query.before ? [Prisma.sql`m.id < ${query.before}::uuid`] : []),
    ];
    const found = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT m.id FROM "Message" m
      JOIN "ChannelMember" cm ON cm."channelId" = m."channelId" AND cm."userId" = ${userId}::uuid
      JOIN "Channel" c ON c.id = m."channelId"
      JOIN "Nook" n ON n.id = c."nookId"
      LEFT JOIN "User" u ON u.id = m."authorId"
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY m.id DESC
      LIMIT ${query.limit + 1}`;

    const ids = found.slice(0, query.limit).map((r) => r.id);
    const rows = await this.prisma.message.findMany({
      where: { id: { in: ids } },
      orderBy: { id: 'desc' },
      select: {
        ...messageColumns,
        channel: { select: { id: true, kind: true, name: true, nook: true, members: { select: { user: true } } } },
      },
    });
    const messages = await this.hydrator.hydrate(rows);
    const items: SearchHit[] = rows.map((row, i) => {
      const { channel } = row;
      const other = channel.kind === 'direct' ? channel.members.find((m) => m.user.id !== userId)?.user : undefined;
      return {
        message: messages[i]!,
        channel: { id: channel.id, kind: channel.kind, name: channel.name, dmUser: other ? toPublicUser(other) : null },
        nook: { id: channel.nook.id, slug: channel.nook.slug, name: channel.nook.name, kit: { field: channel.nook.kitField, mark: channel.nook.kitMark } },
      };
    });
    return { items, nextCursor: found.length > query.limit ? (ids.at(-1) ?? null) : null };
  }
}
