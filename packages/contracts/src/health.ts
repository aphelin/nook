import { z } from 'zod';

export const Health = z.object({
  status: z.literal('ok'),
  instance: z.string(),
  checks: z.object({
    database: z.enum(['up', 'down']),
    redis: z.enum(['up', 'down']),
  }),
});
export type Health = z.infer<typeof Health>;
