import type { Channel, Invite, Nook, NookMember } from '@nook/contracts';
import type {
  Channel as ChannelRow,
  Invite as InviteRow,
  Nook as NookRow,
  NookMember as NookMemberRow,
  User,
} from '../generated/prisma/client.js';
import { toPublicUser } from '../users/users.mapper.js';

export type NookWithCount = NookRow & { _count: { members: number } };
export type ChannelWithMembers = ChannelRow & { members: { user: User }[] };

export function toNook(n: NookWithCount): Nook {
  return {
    id: n.id,
    slug: n.slug,
    name: n.name,
    description: n.description,
    crestUrl: n.crestUrl,
    kit: { field: n.kitField, mark: n.kitMark },
    ownerId: n.ownerId,
    memberCount: n._count.members,
    createdAt: n.createdAt.toISOString(),
  };
}

export function toChannel(c: ChannelWithMembers, viewerId: string): Channel {
  const other = c.kind === 'direct' ? c.members.find((m) => m.user.id !== viewerId)?.user : undefined;
  return {
    id: c.id,
    nookId: c.nookId,
    kind: c.kind,
    name: c.name,
    topic: c.topic,
    dmUser: other ? toPublicUser(other) : null,
    memberIds: c.members.map((m) => m.user.id),
    createdAt: c.createdAt.toISOString(),
  };
}

export function toNookMember(m: NookMemberRow & { user: User }, ownerId: string): NookMember {
  return { ...toPublicUser(m.user), joinedAt: m.joinedAt.toISOString(), isOwner: m.userId === ownerId };
}

export function toInvite(i: InviteRow): Invite {
  return {
    code: i.code,
    nookId: i.nookId,
    expiresAt: i.expiresAt?.toISOString() ?? null,
    maxUses: i.maxUses,
    uses: i.uses,
    createdAt: i.createdAt.toISOString(),
  };
}
