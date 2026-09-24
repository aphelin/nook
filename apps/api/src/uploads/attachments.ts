import { type Attachment, UPLOAD_TYPES } from '@nook/contracts';
import type { Attachment as AttachmentRow } from '../generated/prisma/client.js';
import type { StorageService } from '../storage/storage.service.js';

export const isImage = (mime: string) => UPLOAD_TYPES[mime as keyof typeof UPLOAD_TYPES] === 'image';

/** Keeps a readable, safe file name for the storage key and download header. */
export function safeName(name: string): string {
  const cleaned = name.normalize('NFKC').replace(/[^\p{L}\p{N}._ -]+/gu, '_').replace(/\s+/g, ' ').trim();
  return (cleaned || 'file').slice(-120);
}

export const thumbKeyFor = (storageKey: string) => storageKey.replace(/[^/]+$/, 'thumb.webp');

export async function toAttachment(row: AttachmentRow, storage: StorageService): Promise<Attachment> {
  const inline = isImage(row.mimeType) || row.mimeType === 'application/pdf';
  const [url, thumbUrl] = await Promise.all([
    storage.presignGet(row.storageKey, row.fileName, inline),
    row.thumbKey ? storage.presignGet(row.thumbKey, row.fileName, true) : Promise.resolve(null),
  ]);
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    status: row.status,
    url,
    thumbUrl,
    width: row.width,
    height: row.height,
  };
}
