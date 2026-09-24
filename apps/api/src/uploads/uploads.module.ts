import { Module } from '@nestjs/common';
import { RateLimiter } from '../common/rate-limiter.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, RateLimiter],
  exports: [UploadsService],
})
export class UploadsModule {}
