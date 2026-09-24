import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface IssuedRefresh {
  token: string;
  expiresAt: Date;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class TokensService {
  private readonly secret: Uint8Array;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.secret = new TextEncoder().encode(env.JWT_SECRET);
  }

  get accessTtlS() {
    return this.env.ACCESS_TOKEN_TTL_S;
  }

  signAccess(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setIssuer('nook')
      .setExpirationTime(`${this.env.ACCESS_TOKEN_TTL_S}s`)
      .sign(this.secret);
  }

  async verifyAccess(token: string): Promise<string> {
    try {
      const { payload } = await jwtVerify(token, this.secret, { issuer: 'nook', algorithms: ['HS256'] });
      if (!payload.sub) throw new Error('missing sub');
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Your session has expired');
    }
  }

  /** Starts a new refresh-token family (a fresh login). */
  async issueRefresh(userId: string, userAgent?: string): Promise<IssuedRefresh> {
    const { token, expiresAt } = await this.createRefresh(userId, randomUUID(), userAgent);
    return { token, expiresAt };
  }

  /**
   * Rotates a refresh token. Each token is single-use: presenting one that was already
   * rotated normally means it leaked, so the whole family (every session descended from
   * that login) is revoked.
   *
   * One exception keeps real users signed in: a refresh whose response never arrived
   * (the tab navigated or closed mid-request) leaves the browser holding the old token.
   * If it comes back within the grace window and its replacement was never used, that
   * replacement is retired and a fresh token is issued in the same family.
   */
  async rotate(raw: string, userAgent?: string, attempt = 0): Promise<{ userId: string; refresh: IssuedRefresh }> {
    const current = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (!current) throw new UnauthorizedException('Please sign in again');
    if (current.expiresAt <= new Date()) throw new UnauthorizedException('Please sign in again');

    if (current.revokedAt) {
      const recovered = await this.recoverLostRotation(current, userAgent);
      if (recovered) return recovered;
      await this.revokeFamily(current.familyId);
      throw new UnauthorizedException('This session was signed out for your safety. Please sign in again.');
    }

    // Conditional update: if two requests race with the same token only one claims it.
    // The loser re-reads the token, now rotated seconds ago, and goes through the grace path.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: current.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) {
      if (attempt > 0) throw new UnauthorizedException('Please sign in again');
      return this.rotate(raw, userAgent, attempt + 1);
    }

    const { id, ...refresh } = await this.createRefresh(current.userId, current.familyId, userAgent);
    await this.prisma.refreshToken.update({ where: { id: current.id }, data: { replacedById: id } });
    return { userId: current.userId, refresh };
  }

  private async recoverLostRotation(
    current: { id: string; userId: string; familyId: string; revokedAt: Date | null; replacedById: string | null },
    userAgent?: string,
  ): Promise<{ userId: string; refresh: IssuedRefresh } | null> {
    const graceMs = this.env.REFRESH_REUSE_GRACE_S * 1000;
    if (!current.revokedAt || !current.replacedById || Date.now() - current.revokedAt.getTime() > graceMs) return null;
    // Retire the replacement only if nobody has used it; a used replacement means someone else holds the session.
    const retired = await this.prisma.refreshToken.updateMany({
      where: { id: current.replacedById, revokedAt: null, replacedById: null },
      data: { revokedAt: new Date() },
    });
    if (retired.count === 0) return null;
    const { id, ...refresh } = await this.createRefresh(current.userId, current.familyId, userAgent);
    // Both older tokens now point at the newest, so either can still recover within the window.
    await this.prisma.refreshToken.updateMany({
      where: { id: { in: [current.id, current.replacedById] } },
      data: { replacedById: id },
    });
    return { userId: current.userId, refresh };
  }

  /** Signs out the device holding this token (its whole family). Unknown tokens are ignored. */
  async revoke(raw: string): Promise<void> {
    const token = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (token) await this.revokeFamily(token.familyId);
  }

  private async revokeFamily(familyId: string) {
    await this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async createRefresh(userId: string, familyId: string, userAgent?: string): Promise<IssuedRefresh & { id: string }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    const { id } = await this.prisma.refreshToken.create({
      data: { userId, familyId, tokenHash: sha256(token), expiresAt, userAgent: userAgent?.slice(0, 255) ?? null },
      select: { id: true },
    });
    return { id, token, expiresAt };
  }
}
