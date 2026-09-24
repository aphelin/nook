import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { MessagesService } from '../messages/messages.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { thumbKeyFor } from '../uploads/attachments.js';

const THUMB_EDGE = 800;

@Injectable()
export class ThumbnailProcessor {
  private readonly logger = new Logger('Thumbnails');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly messages: MessagesService,
  ) {}

  /** Records an image's real dimensions (after EXIF rotation) and writes a WebP thumbnail beside it. */
  async process(attachmentId: string) {
    const row = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!row || row.status === 'ready') return;
    let final: { messageId: string | null };
    try {
      const source = await this.storage.read(row.storageKey);
      const meta = await sharp(source).metadata();
      const rotated = (meta.orientation ?? 1) >= 5;
      const width = rotated ? meta.height : meta.width;
      const height = rotated ? meta.width : meta.height;
      const thumb = await sharp(source)
        .rotate()
        .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      const thumbKey = thumbKeyFor(row.storageKey);
      await this.storage.write(thumbKey, thumb, 'image/webp');
      final = await this.prisma.attachment.update({
        where: { id: row.id },
        data: { status: 'ready', width, height, thumbKey },
        select: { messageId: true },
      });
    } catch (err) {
      this.logger.warn(`thumbnail failed for ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      final = await this.prisma.attachment.update({ where: { id: row.id }, data: { status: 'failed' }, select: { messageId: true } });
    }
    // Read the message link from our own write, not the row read before processing: the message
    // may have claimed this upload meanwhile. If it hasn't yet, the send will hydrate the ready state.
    if (final.messageId) await this.messages.broadcastUpdated(final.messageId);
  }
}
