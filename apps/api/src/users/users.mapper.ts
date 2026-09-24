import { Pronouns, type PublicUser } from '@nook/contracts';
import type { User } from '../generated/prisma/client.js';

/** Avatars live privately in storage; this address redirects there. The upload id in the key versions it. */
export function avatarUrl(u: Pick<User, 'id' | 'avatarKey'>): string | null {
  if (!u.avatarKey) return null;
  const version = u.avatarKey.slice(u.avatarKey.lastIndexOf('/') + 1).replace(/\.webp$/, '');
  return `/api/users/${u.id}/avatar?v=${version}`;
}

export function toPublicUser(u: User, now = new Date()): PublicUser {
  // An expired status reads as no status, whether or not anything has cleared it yet.
  const statusLive = !u.statusExpiresAt || u.statusExpiresAt > now;
  return {
    id: u.id,
    handle: u.handle,
    displayName: u.displayName,
    avatarUrl: avatarUrl(u),
    // The column is constrained to the same two values; parsing keeps the type honest without a cast.
    pronouns: Pronouns.safeParse(u.pronouns).data ?? null,
    bio: u.bio,
    status: statusLive
      ? { emoji: u.statusEmoji, text: u.statusText, expiresAt: u.statusExpiresAt?.toISOString() ?? null }
      : { emoji: null, text: null, expiresAt: null },
  };
}
