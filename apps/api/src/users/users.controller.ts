import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import { type AvatarTicket, CreateAvatarUpload, type PublicUser, UpdateProfile } from '@nook/contracts';
import type { Response } from 'express';
import type { z } from 'zod';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
  ) {}

  @Get('me')
  me(@CurrentUser() me: AuthUser): Promise<PublicUser> {
    return this.users.me(me.id);
  }

  @Patch('me')
  update(@CurrentUser() me: AuthUser, @Body(new ZodValidationPipe(UpdateProfile)) input: z.output<typeof UpdateProfile>): Promise<PublicUser> {
    return this.users.update(me.id, input);
  }

  @Post('me/avatar')
  async avatarTicket(@CurrentUser() me: AuthUser, @Body(new ZodValidationPipe(CreateAvatarUpload)) input: CreateAvatarUpload): Promise<AvatarTicket> {
    await this.limiter.hit(`avatar:${me.id}`, 10, 60);
    return this.users.avatarTicket(me.id, input);
  }

  @Post('me/avatar/:uploadId/complete')
  completeAvatar(@CurrentUser() me: AuthUser, @Param('uploadId', ParseUUIDPipe) uploadId: string): Promise<PublicUser> {
    return this.users.completeAvatar(me.id, uploadId);
  }

  @Delete('me/avatar')
  removeAvatar(@CurrentUser() me: AuthUser): Promise<PublicUser> {
    return this.users.removeAvatar(me.id);
  }

  /**
   * Public, like a profile picture anywhere: an <img> can't send a bearer token. The redirect goes
   * to an hour-stable signed URL, and browsers may cache the redirect for as long as it's valid.
   */
  @Public()
  @Get(':id/avatar')
  async avatar(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const location = await this.users.avatarLocation(id);
    if (!location) return res.status(404).json({ statusCode: 404, message: 'No avatar' });
    res.setHeader('Cache-Control', 'private, max-age=3000');
    return res.redirect(302, location);
  }
}
