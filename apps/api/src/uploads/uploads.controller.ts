import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { type Attachment, CreateUpload, type UploadTicket } from '@nook/contracts';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { UploadsService } from './uploads.service.js';

@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly limiter: RateLimiter,
  ) {}

  @Post()
  async ticket(@CurrentUser() me: AuthUser, @Body(new ZodValidationPipe(CreateUpload)) input: CreateUpload): Promise<UploadTicket> {
    await this.limiter.hit(`upload:${me.id}`, 30, 60);
    return this.uploads.ticket(me.id, input);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<Attachment> {
    return this.uploads.complete(me.id, id);
  }
}
