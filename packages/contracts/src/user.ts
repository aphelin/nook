import { z } from 'zod';
import { Emoji, Id, IsoDate } from './common.js';

export const Handle = z
  .string()
  .min(2)
  .max(24)
  .regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers and underscores only');

export const PresenceState = z.enum(['online', 'away', 'dnd', 'offline']);
export type PresenceState = z.infer<typeof PresenceState>;

/** Everyone in a nook with their current presence. */
export const PresenceSnapshot = z.record(z.string(), PresenceState);
export type PresenceSnapshot = z.infer<typeof PresenceSnapshot>;

/** Your own chosen status. */
export const ManualStatus = z.enum(['online', 'away', 'dnd']);
export type ManualStatus = z.infer<typeof ManualStatus>;

/** A custom status: an emoji, a line of text, or both, optionally clearing itself later. */
export const UserStatus = z.object({
  emoji: Emoji.nullable(),
  text: z.string().max(80).nullable(),
  expiresAt: IsoDate.nullable(),
});
export type UserStatus = z.infer<typeof UserStatus>;

/** The pronouns a profile can show: one of these two, or none. */
export const PRONOUNS = ['he/him', 'she/her'] as const;
export const Pronouns = z.enum(PRONOUNS, { error: 'Choose he/him or she/her' });
export type Pronouns = z.infer<typeof Pronouns>;

/**
 * The shapes a person can be, by name. The first eight are the ones a handle is given until its
 * owner picks one; the order of those eight must never change. Names, not positions, are stored.
 */
export const FACE_SHAPES = [
  'circle',
  'flower',
  'scallop',
  'squircle',
  'arch',
  'clover',
  'sparkle',
  'pebble',
  'star',
  'burst',
  'hex',
  'pick',
  'trefoil',
  'wave',
  'leaf',
  'drop',
  'bowl',
  'blob',
  'diamond',
  'capsule',
  'crown',
] as const;
export const FaceShape = z.enum(FACE_SHAPES, { error: 'Pick one of the shapes' });
export type FaceShape = z.infer<typeof FaceShape>;

/** Which of the surface's three face colours a person wears; each surface computes its own three. */
export const FaceTone = z.union([z.literal(1), z.literal(2), z.literal(3)], { error: 'Pick one of the three colours' });
export type FaceTone = z.infer<typeof FaceTone>;

/** A face someone chose. `null` on a profile means "the one my handle gives me". */
export const Face = z.object({ shape: FaceShape, tone: FaceTone });
export type Face = z.infer<typeof Face>;

export const PublicUser = z.object({
  id: Id,
  handle: Handle,
  displayName: z.string().min(1).max(48),
  /** Same-origin path (the api redirects to storage), versioned so a new avatar is a new URL. */
  avatarUrl: z.string().startsWith('/').nullable(),
  pronouns: Pronouns.nullable(),
  bio: z.string().max(280).nullable(),
  status: UserStatus,
  face: Face.nullable(),
});
export type PublicUser = z.infer<typeof PublicUser>;

/** Empty text means "none". */
const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .transform((v) => v || null)
    .nullable();

/** Any subset of your profile; `null` clears a field. */
export const UpdateProfile = z
  .object({
    displayName: z.string().trim().min(1, 'Your name can’t be empty').max(48, 'Keep your name under 48 characters'),
    pronouns: Pronouns.nullable(),
    bio: optionalText(280, 'Keep your bio under 280 characters'),
    status: z
      .object({
        emoji: Emoji.nullable(),
        text: optionalText(80, 'Keep your status under 80 characters'),
        expiresAt: IsoDate.nullable().default(null),
      })
      .nullable(),
    face: Face.nullable(),
  })
  .partial();
export type UpdateProfile = z.input<typeof UpdateProfile>;

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

export const CreateAvatarUpload = z.object({
  mimeType: z.enum(AVATAR_TYPES, { error: 'Use a PNG, JPEG, WebP or GIF image' }),
  size: z
    .number()
    .int()
    .positive()
    .max(AVATAR_MAX_BYTES, `Avatars can be up to ${AVATAR_MAX_BYTES / 1024 / 1024} MB`),
});
export type CreateAvatarUpload = z.infer<typeof CreateAvatarUpload>;

/** Where the browser PUTs the image; `complete` with the same id once it's there. */
export const AvatarTicket = z.object({
  uploadId: Id,
  uploadUrl: z.url(),
  headers: z.record(z.string(), z.string()),
  expiresAt: IsoDate,
});
export type AvatarTicket = z.infer<typeof AvatarTicket>;
