import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ManualStatus, PresenceSnapshot, PresenceState } from '@nook/contracts';
import { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService, rooms } from '../realtime/realtime.service.js';
import { REDIS } from '../redis/redis.module.js';

/** A socket's lease; each replica renews its own sockets well inside it. */
export const LEASE_MS = 60_000;
export const RENEW_MS = 20_000;

const keys = {
  conn: (u: string) => `presence:conn:${u}`, // ZSET socketId → lease expiry
  idle: (u: string) => `presence:idle:${u}`, // ZSET of idle socketIds → lease expiry
  manual: (u: string) => `presence:manual:${u}`, // "away" | "dnd"
  last: (u: string) => `presence:last:${u}`, // last announced state
  users: 'presence:users', // ZSET userId → latest lease expiry, for the sweeper
};

// Drops expired leases, then derives the state. With a 5th key it also swaps it
// into "last" and returns the previous value, atomically, so replicas never race.
const STATE_SCRIPT = `
local now = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
local live = redis.call('ZCARD', KEYS[1])
local idle = redis.call('ZCARD', KEYS[2])
local manual = redis.call('GET', KEYS[3])
local state
if live == 0 then state = 'offline'
elseif manual == 'dnd' then state = 'dnd'
elseif manual == 'away' or idle >= live then state = 'away'
else state = 'online' end
if #KEYS < 4 then return {state, state} end
local prev = redis.call('GET', KEYS[4]) or 'offline'
redis.call('SET', KEYS[4], state)
return {prev, state}
`;

@Injectable()
export class PresenceService {
  private readonly logger = new Logger('Presence');

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async connect(userId: string, socketId: string) {
    const expiry = Date.now() + LEASE_MS;
    await this.redis.multi().zadd(keys.conn(userId), expiry, socketId).zadd(keys.users, 'GT', expiry, userId).exec();
    await this.recompute(userId);
  }

  async disconnect(userId: string, socketId: string) {
    await this.redis.multi().zrem(keys.conn(userId), socketId).zrem(keys.idle(userId), socketId).exec();
    await this.recompute(userId);
  }

  async setIdle(userId: string, socketId: string, idle: boolean) {
    if (idle) await this.redis.zadd(keys.idle(userId), Date.now() + LEASE_MS, socketId);
    else await this.redis.zrem(keys.idle(userId), socketId);
    await this.recompute(userId);
  }

  async setManual(userId: string, status: ManualStatus) {
    if (status === 'online') await this.redis.del(keys.manual(userId));
    else await this.redis.set(keys.manual(userId), status);
    await this.recompute(userId);
  }

  async manualStatus(userId: string): Promise<ManualStatus> {
    const manual = await this.redis.get(keys.manual(userId));
    return manual === 'away' || manual === 'dnd' ? manual : 'online';
  }

  /** Extends the leases of sockets this replica still holds. XX: never resurrects a removed socket. */
  async renew(sockets: { userId: string; socketId: string }[]) {
    if (sockets.length === 0) return;
    const expiry = Date.now() + LEASE_MS;
    const pipe = this.redis.pipeline();
    for (const { userId, socketId } of sockets) {
      pipe.zadd(keys.conn(userId), 'XX', expiry, socketId);
      pipe.zadd(keys.idle(userId), 'XX', expiry, socketId);
      pipe.zadd(keys.users, 'GT', expiry, userId);
    }
    await pipe.exec();
  }

  /**
   * Finds people whose leases lapsed without a disconnect (a replica crashed) and
   * announces them offline. Safe on every replica at once: the swap is atomic.
   */
  async sweep(now = Date.now()) {
    const lapsed = await this.redis.zrangebyscore(keys.users, '-inf', now);
    for (const userId of lapsed) {
      const state = await this.recompute(userId);
      if (state === 'offline') await this.redis.zrem(keys.users, userId);
    }
    return lapsed.length;
  }

  async snapshot(userIds: string[]): Promise<PresenceSnapshot> {
    const now = Date.now();
    const results = await Promise.all(
      userIds.map((u) => this.redis.eval(STATE_SCRIPT, 3, keys.conn(u), keys.idle(u), keys.manual(u), now) as Promise<[string, string]>),
    );
    return Object.fromEntries(userIds.map((u, i) => [u, results[i]![1] as PresenceState]));
  }

  /** Recomputes someone's state and, only if it changed, tells every nook they belong to. */
  private async recompute(userId: string): Promise<PresenceState> {
    const [prev, state] = (await this.redis.eval(
      STATE_SCRIPT,
      4,
      keys.conn(userId),
      keys.idle(userId),
      keys.manual(userId),
      keys.last(userId),
      Date.now(),
    )) as [PresenceState, PresenceState];
    if (prev !== state) {
      const nooks = await this.prisma.nookMember.findMany({ where: { userId }, select: { nookId: true } });
      if (nooks.length) this.realtime.emit(nooks.map((n) => rooms.nook(n.nookId)), 'presence', { userId, state });
      this.logger.debug(`${userId}: ${prev} → ${state}`);
    }
    return state;
  }
}
