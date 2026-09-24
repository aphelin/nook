import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import type { PresenceSnapshot } from '@nook/contracts';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PresenceService } from './presence.service.js';

@Controller()
export class PresenceController {
  constructor(
    private readonly presence: PresenceService,
    private readonly prisma: PrismaService,
  ) {}

  /** Presence of everyone in a nook, for the member sheet's first paint; live changes follow over the socket. */
  @Get('nooks/:slug/presence')
  async snapshot(@CurrentUser() me: AuthUser, @Param('slug') slug: string): Promise<PresenceSnapshot> {
    const nook = await this.prisma.nook.findFirst({
      where: { slug, members: { some: { userId: me.id } } },
      select: { members: { select: { userId: true } } },
    });
    if (!nook) throw new NotFoundException('Nook not found');
    return this.presence.snapshot(nook.members.map((m) => m.userId));
  }
}
