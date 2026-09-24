import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ListNotifications, MarkNotificationsRead, type NotificationPage, ReadChannel, type UnreadState } from '@nook/contracts';
import type { z } from 'zod';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { NotificationsService } from './notifications.service.js';

@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('unread')
  unread(@CurrentUser() me: AuthUser): Promise<UnreadState> {
    return this.notifications.unread(me.id);
  }

  @Post('channels/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  readChannel(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ReadChannel)) input: ReadChannel,
  ): Promise<void> {
    return this.notifications.readChannel(me.id, id, input.messageId);
  }

  @Get('notifications')
  list(
    @CurrentUser() me: AuthUser,
    @Query(new ZodValidationPipe(ListNotifications))
    page: z.infer<typeof ListNotifications>,
  ): Promise<NotificationPage> {
    return this.notifications.list(me.id, page);
  }

  @Post('notifications/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(
    @CurrentUser() me: AuthUser,
    @Body(new ZodValidationPipe(MarkNotificationsRead))
    input: MarkNotificationsRead,
  ): Promise<void> {
    return this.notifications.markRead(me.id, input);
  }
}
