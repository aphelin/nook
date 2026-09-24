import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ApiError } from '@nook/contracts';
import type { Response } from 'express';

/** Normalises every error into the shared `ApiError` shape; never leaks internals on 500. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      const body: ApiError = { statusCode: 500, message: 'Something went wrong on our side' };
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
      return;
    }
    const status = exception.getStatus();
    const payload = exception.getResponse();
    const body: ApiError =
      typeof payload === 'object' && payload !== null && 'issues' in payload
        ? (payload as ApiError)
        : {
            statusCode: status,
            message: messageOf(payload, exception.message),
          };
    res.status(status).json(body);
  }
}

/** Nest payloads carry `message` as a string or, from its own validators, a string array. */
function messageOf(payload: string | object, fallback: string): string {
  if (typeof payload === 'string') return payload;
  const message = (payload as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message) && message.every((m) => typeof m === 'string')) return message.join('. ');
  return fallback;
}
