import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { MessagesService } from '../messages/messages.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { parsePreview } from './parse.js';
import { fetchPublicHtml } from './safe-fetch.js';
import { extractUrls } from './urls.js';

@Injectable()
export class UnfurlService {
  private readonly logger = new Logger('Unfurl');

  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Fetches previews for a message's links, stores the ones worth showing, and pushes the update live. */
  async unfurlMessage(messageId: string): Promise<number> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId }, select: { body: true, deletedAt: true } });
    if (!message || message.deletedAt) return 0;
    const urls = extractUrls(message.body);
    let saved = 0;
    for (const url of urls) {
      try {
        const page = await fetchPublicHtml(url, { allowPrivate: this.env.UNFURL_ALLOW_PRIVATE });
        const preview = parsePreview(page.html, page.url);
        if (!preview.title) continue;
        await this.prisma.linkPreview.upsert({
          where: { messageId_url: { messageId, url } },
          create: { messageId, url, ...preview },
          update: { ...preview, fetchedAt: new Date() },
        });
        saved++;
      } catch (err) {
        // A link that can't (or mustn't) be previewed simply has no card.
        this.logger.debug(`no preview for ${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    // Links removed by an edit lose their cards.
    await this.prisma.linkPreview.deleteMany({ where: { messageId, url: { notIn: urls } } });
    await this.messages.broadcastUpdated(messageId);
    return saved;
  }
}
