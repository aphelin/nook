import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ApiError } from '@nook/contracts';
import type { z } from 'zod';

/** Validates and transforms input with a shared contract schema. Emits `ApiError` issues on failure. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const body: ApiError = {
      statusCode: 400,
      message: 'Some fields need attention',
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
    throw new BadRequestException(body);
  }
}
