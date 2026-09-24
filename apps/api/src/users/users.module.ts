import { Module } from '@nestjs/common';
import { RateLimiter } from '../common/rate-limiter.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({ controllers: [UsersController], providers: [UsersService, RateLimiter], exports: [UsersService] })
export class UsersModule {}
