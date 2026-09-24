import { z } from 'zod';

/** Every entity id is a UUIDv7: time-sortable, so clients can mint ids for optimistic sends. */
export const Id = z.uuid();
export type Id = z.infer<typeof Id>;

export const IsoDate = z.iso.datetime({ offset: true });

export const CursorPage = z.object({
  before: Id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type CursorPage = z.infer<typeof CursorPage>;

export const paged = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: Id.nullable(),
  });

export const ApiError = z.object({
  statusCode: z.number().int(),
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ApiError = z.infer<typeof ApiError>;

/**
 * One emoji: a single extended grapheme that is pictographic (so "👍🏽", "🧗‍♀️" and "🇬🇪" pass,
 * "a", "👍👍" and "<b>" don't).
 */
export const Emoji = z
  .string()
  .min(1)
  .max(32)
  .refine((s) => {
    const graphemes = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)];
    return graphemes.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s);
  }, 'Pick a single emoji');
