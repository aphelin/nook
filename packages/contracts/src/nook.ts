import { z } from 'zod';
import { Id, IsoDate } from './common.js';
import { Kit } from './kit.js';
import { PublicUser } from './user.js';

export const Slug = z
  .string()
  .min(2)
  .max(32)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and single dashes only');

export const Nook = z.object({
  id: Id,
  slug: Slug,
  name: z.string().min(1).max(48),
  description: z.string().max(280).nullable(),
  crestUrl: z.url().nullable(),
  kit: Kit,
  ownerId: Id,
  memberCount: z.number().int().nonnegative(),
  createdAt: IsoDate,
});
export type Nook = z.infer<typeof Nook>;

export const CreateNook = z.object({
  name: z.string().trim().min(1, 'Give your nook a name').max(48),
  slug: Slug,
  description: z.string().trim().max(280).nullable().default(null),
  kit: Kit,
});
export type CreateNook = z.infer<typeof CreateNook>;

export const UpdateNook = CreateNook.omit({ slug: true }).partial();
export type UpdateNook = z.infer<typeof UpdateNook>;

export const ChannelKind = z.enum(['public', 'private', 'direct']);
export type ChannelKind = z.infer<typeof ChannelKind>;

export const ChannelName = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Name the channel')
  .max(40)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, 'Lowercase letters, numbers, dashes and underscores');

export const Channel = z.object({
  id: Id,
  nookId: Id,
  kind: ChannelKind,
  /** Null for direct messages. */
  name: z.string().nullable(),
  topic: z.string().nullable(),
  /** For direct messages: the other person. */
  dmUser: PublicUser.nullable(),
  /** Who can read it, and so who can be @mentioned in it. */
  memberIds: z.array(Id),
  createdAt: IsoDate,
});
export type Channel = z.infer<typeof Channel>;

export const CreateChannel = z.object({
  name: ChannelName,
  topic: z.string().trim().max(200).nullable().default(null),
  kind: z.enum(['public', 'private']).default('public'),
});
export type CreateChannel = z.infer<typeof CreateChannel>;

export const OpenDirect = z.object({ userId: Id });
export type OpenDirect = z.infer<typeof OpenDirect>;

export const NookMember = PublicUser.extend({
  joinedAt: IsoDate,
  isOwner: z.boolean(),
});
export type NookMember = z.infer<typeof NookMember>;

/** Everything the shell needs for one nook, from the viewer's point of view. */
export const NookDetail = z.object({
  nook: Nook,
  channels: z.array(Channel),
  members: z.array(NookMember),
});
export type NookDetail = z.infer<typeof NookDetail>;

export const CreateInvite = z.object({
  expiresInHours: z.number().int().min(1).max(24 * 30).nullable().default(null),
  maxUses: z.number().int().min(1).max(1000).nullable().default(null),
});
export type CreateInvite = z.infer<typeof CreateInvite>;

export const Invite = z.object({
  code: z.string(),
  nookId: Id,
  expiresAt: IsoDate.nullable(),
  maxUses: z.number().int().nullable(),
  uses: z.number().int(),
  createdAt: IsoDate,
});
export type Invite = z.infer<typeof Invite>;

/** What anyone holding an invite link may see before joining. */
export const InvitePreview = z.object({
  code: z.string(),
  nook: Nook.pick({ name: true, slug: true, description: true, kit: true, crestUrl: true, memberCount: true }),
  invitedBy: PublicUser.pick({ displayName: true, handle: true }),
  status: z.enum(['valid', 'expired', 'used_up', 'revoked']),
});
export type InvitePreview = z.infer<typeof InvitePreview>;
