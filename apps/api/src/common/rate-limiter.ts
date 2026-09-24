import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';

/**
 * Fixed-window limiter in Redis, shared by every api replica.
 * INCR + EXPIRE run in one MULTI so a crash can't leave a key without a TTL.
 */
@Injectable()
export class RateLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async hit(key: string, limit: number, windowS: number): Promise<void> {
    const results = await this.redis.multi().incr(`rl:${key}`).expire(`rl:${key}`, windowS, 'NX').ttl(`rl:${key}`).exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    const ttl = Number(results?.[2]?.[1] ?? windowS);
    if (count > limit) {
      throw new HttpException(
        { statusCode: 429, message: `Too many attempts. Try again in ${Math.max(ttl, 1)} seconds.` },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
