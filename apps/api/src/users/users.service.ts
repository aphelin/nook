import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AVATAR_MAX_BYTES, type AvatarTicket, type CreateAvatarUpload, type PublicUser, UpdateProfile } from '@nook/contracts';
import sharp from 'sharp';
import type { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService, rooms } from '../realtime/realtime.service.js';
import { StorageService } from '../storage/storage.service.js';
import { toPublicUser } from './users.mapper.js';

const TICKET_TTL_S = 600;
export const AVATAR_EDGE = 256;
/** Refuse decompression bombs: a small file that inflates to a gigantic bitmap. */
const MAX_INPUT_PIXELS = 40_000_000;
export const ABANDONED_AVATAR_MS = 24 * 3_600_000;

/** Where the browser's original lands, and where the processed square goes. */
const uploadKey = (userId: string, uploadId: string) => `avatar-uploads/${userId}/${uploadId}`;
const avatarKey = (userId: string, uploadId: string) => `avatars/${userId}/${uploadId}.webp`;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeService,
  ) {}

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Account not found');
    return toPublicUser(user);
  }

  async update(userId: string, input: z.output<typeof UpdateProfile>): Promise<PublicUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: input.displayName,
        pronouns: input.pronouns,
        bio: input.bio,
        ...(input.status !== undefined && {
          statusEmoji: input.status?.emoji ?? null,
          statusText: input.status?.text ?? null,
          // A status with nothing in it has nothing to expire.
          statusExpiresAt: input.status && (input.status.emoji || input.status.text) ? (input.status.expiresAt ? new Date(input.status.expiresAt) : null) : null,
        }),
      },
    });
    return this.announce(toPublicUser(user));
  }

  /** Signs a PUT for the original image. It goes under your own prefix, so only you can complete it. */
  async avatarTicket(userId: string, input: CreateAvatarUpload): Promise<AvatarTicket> {
    const uploadId = randomUUID();
    return {
      uploadId,
      uploadUrl: await this.storage.presignPut(uploadKey(userId, uploadId), input.mimeType, input.size, TICKET_TTL_S),
      headers: { 'Content-Type': input.mimeType },
      expiresAt: new Date(Date.now() + TICKET_TTL_S * 1000).toISOString(),
    };
  }

  /**
   * Decodes the uploaded original (anything that isn't really an image is refused), crops it to a
   * square around its most interesting part, and stores a small WebP. The previous avatar and the
   * original are deleted.
   */
  async completeAvatar(userId: string, uploadId: string): Promise<PublicUser> {
    const source = uploadKey(userId, uploadId);
    const object = await this.storage.head(source);
    if (!object) throw new NotFoundException('Upload not found');
    if (object.size > AVATAR_MAX_BYTES) {
      await this.storage.remove([source]);
      throw new BadRequestException('That image is too large.');
    }
    let square: Buffer;
    try {
      square = await sharp(await this.storage.read(source), { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize(AVATAR_EDGE, AVATAR_EDGE, { fit: 'cover', position: sharp.strategy.attention })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      await this.storage.remove([source]);
      throw new BadRequestException('That file isn’t an image we can read.');
    }
    const key = avatarKey(userId, uploadId);
    await this.storage.write(key, square, 'image/webp');
    const previous = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarKey: true } });
    const user = await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: key } });
    await this.storage.remove([source, ...(previous.avatarKey && previous.avatarKey !== key ? [previous.avatarKey] : [])]);
    return this.announce(toPublicUser(user));
  }

  async removeAvatar(userId: string): Promise<PublicUser> {
    const previous = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarKey: true } });
    const user = await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: null } });
    if (previous.avatarKey) await this.storage.remove([previous.avatarKey]);
    return this.announce(toPublicUser(user));
  }

  /** A signed storage URL for someone's current avatar, or null. (`?v=` only busts caches; any version gets the current one.) */
  async avatarLocation(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarKey: true } });
    if (!user?.avatarKey) return null;
    return this.storage.presignGet(user.avatarKey, 'avatar.webp', true);
  }

  /** Originals that were uploaded but never completed. */
  async cleanupAbandonedAvatars(now = Date.now()): Promise<number> {
    const stale = (await this.storage.list('avatar-uploads/')).filter((o) => o.modifiedAt.getTime() < now - ABANDONED_AVATAR_MS);
    await this.storage.remove(stale.map((o) => o.key));
    return stale.length;
  }

  /** Everyone who shares a nook with you (and your other tabs) gets the new profile. */
  private async announce(user: PublicUser): Promise<PublicUser> {
    const nooks = await this.prisma.nookMember.findMany({ where: { userId: user.id }, select: { nookId: true } });
    this.realtime.emit([rooms.user(user.id), ...nooks.map((n) => rooms.nook(n.nookId))], 'user:updated', user);
    return user;
  }
}
