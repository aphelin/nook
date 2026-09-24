import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Attachment, CreateUpload, UploadTicket } from '@nook/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { JobsService } from '../queue/jobs.service.js';
import { StorageService } from '../storage/storage.service.js';
import { isImage, safeName, thumbKeyFor, toAttachment } from './attachments.js';

const TICKET_TTL_S = 600;
export const STALE_UPLOAD_MS = 24 * 3_600_000;

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
  ) {}

  /** Reserves an attachment and signs a PUT that only accepts the declared type and size. */
  async ticket(userId: string, input: CreateUpload): Promise<UploadTicket> {
    const id = randomUUID();
    const fileName = safeName(input.fileName);
    const storageKey = `attachments/${userId}/${id}/${fileName}`;
    const attachment = await this.prisma.attachment.create({
      data: { uploaderId: userId, storageKey, fileName, mimeType: input.mimeType, size: input.size },
    });
    return {
      attachmentId: attachment.id,
      uploadUrl: await this.storage.presignPut(storageKey, input.mimeType, input.size, TICKET_TTL_S),
      headers: { 'Content-Type': input.mimeType },
      expiresAt: new Date(Date.now() + TICKET_TTL_S * 1000).toISOString(),
    };
  }

  /** Confirms the bytes really landed as declared; images go to the worker for dimensions and a thumbnail. */
  async complete(userId: string, attachmentId: string): Promise<Attachment> {
    const row = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!row || row.uploaderId !== userId) throw new NotFoundException('Upload not found');
    if (row.status === 'ready' || (row.status === 'pending' && isImage(row.mimeType) && row.width)) return toAttachment(row, this.storage);

    const object = await this.storage.head(row.storageKey);
    if (!object) throw new BadRequestException('The file hasn’t finished uploading yet.');
    if (object.size !== row.size) {
      await this.prisma.attachment.update({ where: { id: row.id }, data: { status: 'failed' } });
      throw new BadRequestException('The uploaded file doesn’t match what was declared.');
    }

    if (isImage(row.mimeType)) {
      await this.jobs.enqueue('thumbnail', { attachmentId: row.id }, `thumbnail-${row.id}`);
      return toAttachment(row, this.storage);
    }
    const ready = await this.prisma.attachment.update({ where: { id: row.id }, data: { status: 'ready' } });
    return toAttachment(ready, this.storage);
  }

  /** Uploads that were started and never sent: delete the objects and the rows. */
  async cleanupStale(now = Date.now()): Promise<number> {
    const stale = await this.prisma.attachment.findMany({
      where: { messageId: null, createdAt: { lt: new Date(now - STALE_UPLOAD_MS) } },
      select: { id: true, storageKey: true, thumbKey: true },
    });
    if (stale.length === 0) return 0;
    await this.storage.remove(stale.flatMap((a) => [a.storageKey, a.thumbKey ?? thumbKeyFor(a.storageKey)]));
    await this.prisma.attachment.deleteMany({ where: { id: { in: stale.map((a) => a.id) } } });
    return stale.length;
  }
}
