import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimiter } from '../common/rate-limiter.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { TokensService } from './tokens.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, TokensService, RateLimiter, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [TokensService],
})
export class AuthModule {}
