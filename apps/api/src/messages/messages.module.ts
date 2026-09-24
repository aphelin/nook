import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { PresenceModule } from '../presence/presence.module.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { NotificationsController } from '../notifications/notifications.controller.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SearchController } from '../search/search.controller.js';
import { SearchService } from '../search/search.service.js';
import { MessageHydrator } from './hydrator.js';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';

@Module({
  imports: [AuthModule, PresenceModule],
  controllers: [MessagesController, NotificationsController, SearchController],
  providers: [MessagesService, MessageHydrator, NotificationsService, SearchService, RealtimeGateway, RateLimiter],
  exports: [MessagesService],
})
export class MessagesModule {}
