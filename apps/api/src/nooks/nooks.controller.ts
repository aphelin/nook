import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Res } from '@nestjs/common';
import {
  type Channel,
  CreateChannel,
  CreateInvite,
  CreateNook,
  type Invite,
  type InvitePreview,
  type Nook,
  type NookDetail,
  OpenDirect,
  UpdateNook,
} from '@nook/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { NooksService } from './nooks.service.js';

const AddMembers = z.object({ userIds: z.array(z.uuid()).min(1).max(100) });

@Controller()
export class NooksController {
  constructor(private readonly nooks: NooksService) {}

  @Get('nooks')
  list(@CurrentUser() me: AuthUser): Promise<Nook[]> {
    return this.nooks.listMine(me.id);
  }

  @Post('nooks')
  create(@CurrentUser() me: AuthUser, @Body(new ZodValidationPipe(CreateNook)) input: CreateNook): Promise<NookDetail> {
    return this.nooks.create(me.id, input);
  }

  @Get('nooks/:slug')
  detail(@CurrentUser() me: AuthUser, @Param('slug') slug: string): Promise<NookDetail> {
    return this.nooks.detail(slug, me.id);
  }

  @Patch('nooks/:slug')
  update(
    @CurrentUser() me: AuthUser,
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(UpdateNook)) input: UpdateNook,
  ): Promise<Nook> {
    return this.nooks.update(slug, me.id, input);
  }

  @Post('nooks/:slug/channels')
  createChannel(
    @CurrentUser() me: AuthUser,
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(CreateChannel)) input: CreateChannel,
  ): Promise<Channel> {
    return this.nooks.createChannel(slug, me.id, input);
  }

  @Post('channels/:id/members')
  @HttpCode(HttpStatus.OK)
  addMembers(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AddMembers)) input: z.infer<typeof AddMembers>,
  ): Promise<Channel> {
    return this.nooks.addChannelMembers(id, me.id, input.userIds);
  }

  @Post('nooks/:slug/directs')
  async openDirect(
    @CurrentUser() me: AuthUser,
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(OpenDirect)) input: OpenDirect,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Channel> {
    const { channel, created } = await this.nooks.openDirect(slug, me.id, input.userId);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return channel;
  }

  @Post('nooks/:slug/invites')
  createInvite(
    @CurrentUser() me: AuthUser,
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(CreateInvite)) input: CreateInvite,
  ): Promise<Invite> {
    return this.nooks.createInvite(slug, me.id, input);
  }

  @Get('nooks/:slug/invites')
  listInvites(@CurrentUser() me: AuthUser, @Param('slug') slug: string): Promise<Invite[]> {
    return this.nooks.listInvites(slug, me.id);
  }

  @Public()
  @Get('invites/:code')
  preview(@Param('code') code: string): Promise<InvitePreview> {
    return this.nooks.previewInvite(code);
  }

  @Post('invites/:code/accept')
  @HttpCode(HttpStatus.OK)
  accept(@CurrentUser() me: AuthUser, @Param('code') code: string): Promise<Nook> {
    return this.nooks.acceptInvite(code, me.id);
  }

  @Delete('invites/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@CurrentUser() me: AuthUser, @Param('code') code: string): Promise<void> {
    return this.nooks.revokeInvite(code, me.id);
  }
}
