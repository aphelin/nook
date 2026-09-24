import { Module } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module.js';
import { NooksController } from './nooks.controller.js';
import { NooksService } from './nooks.service.js';

@Module({
  imports: [MessagesModule],
  controllers: [NooksController],
  providers: [NooksService],
  exports: [NooksService],
})
export class NooksModule {}
