import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { LoginInput, PublicUser, RegisterInput } from '@nook/contracts';
import argon2 from 'argon2';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toPublicUser } from '../users/users.mapper.js';
import { type IssuedRefresh, TokensService } from './tokens.service.js';

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  user: PublicUser;
  refresh: IssuedRefresh;
}

// Verified against when the email is unknown, so a miss costs the same time as a wrong password.
const DUMMY_HASH = await argon2.hash('nook-timing-equaliser');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  async register(input: RegisterInput, userAgent?: string): Promise<IssuedSession> {
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email.toLowerCase(),
          handle: input.handle,
          displayName: input.displayName,
          passwordHash,
        },
      });
      return this.issue(user.id, toPublicUser(user), userAgent);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const fields = JSON.stringify(err.meta ?? {});
        throw new ConflictException(
          fields.includes('handle') ? 'That handle is taken. Try another.' : 'An account with that email already exists. Sign in instead.',
        );
      }
      throw err;
    }
  }

  async login(input: LoginInput, userAgent?: string): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    const ok = await argon2.verify(user?.passwordHash ?? DUMMY_HASH, input.password);
    if (!user || !ok) throw new UnauthorizedException('That email and password don’t match.');
    return this.issue(user.id, toPublicUser(user), userAgent);
  }

  /** Signs in as the seeded demo account: only that one account, only when the caller has checked it's enabled. */
  async demo(email: string, userAgent?: string): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) throw new NotFoundException('The demo isn’t set up here.');
    return this.issue(user.id, toPublicUser(user), userAgent);
  }

  async refresh(rawRefresh: string, userAgent?: string): Promise<IssuedSession> {
    const { userId, refresh } = await this.tokens.rotate(rawRefresh, userAgent);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Please sign in again');
    return {
      accessToken: await this.tokens.signAccess(user.id),
      expiresIn: this.tokens.accessTtlS,
      user: toPublicUser(user),
      refresh,
    };
  }

  logout(rawRefresh: string | undefined): Promise<void> {
    return rawRefresh ? this.tokens.revoke(rawRefresh) : Promise.resolve();
  }

  private async issue(userId: string, user: PublicUser, userAgent?: string): Promise<IssuedSession> {
    const [accessToken, refresh] = await Promise.all([this.tokens.signAccess(userId), this.tokens.issueRefresh(userId, userAgent)]);
    return { accessToken, expiresIn: this.tokens.accessTtlS, user, refresh };
  }
}
