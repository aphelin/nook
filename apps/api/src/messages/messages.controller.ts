import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Put, Query } from '@nestjs/common';
import { EditMessage, Emoji, ListMessages, type Message, type MessagePage } from '@nook/contracts';
import type { z } from 'zod';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MessagesService } from './messages.service.js';

/** History and edits over HTTP; new messages go over the socket (see RealtimeGateway). */
@Controller()
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
  ) {}

  @Get('channels/:id/messages')
  list(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(ListMessages)) page: z.infer<typeof ListMessages>,
  ): Promise<MessagePage> {
    return this.messages.list(id, me.id, page);
  }

  @Get('messages/:id')
  get(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<Message> {
    return this.messages.get(id, me.id);
  }

  @Get('messages/:id/replies')
  replies(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(ListMessages)) page: z.infer<typeof ListMessages>,
  ): Promise<MessagePage> {
    return this.messages.replies(id, me.id, page);
  }

  /** Idempotent: reacting twice with the same emoji is one reaction. */
  @Put('messages/:id/reactions/:emoji')
  async react(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('emoji', new ZodValidationPipe(Emoji)) emoji: string,
  ): Promise<Message> {
    await this.limiter.hit(`react:${me.id}`, 30, 10);
    return this.messages.react(id, me.id, emoji, true);
  }

  @Delete('messages/:id/reactions/:emoji')
  async unreact(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('emoji', new ZodValidationPipe(Emoji)) emoji: string,
  ): Promise<Message> {
    await this.limiter.hit(`react:${me.id}`, 30, 10);
    return this.messages.react(id, me.id, emoji, false);
  }

  @Patch('messages/:id')
  edit(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(EditMessage)) input: EditMessage,
  ): Promise<Message> {
    return this.messages.edit(id, me.id, input.body);
  }

  @Delete('messages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.messages.remove(id, me.id);
  }
}
