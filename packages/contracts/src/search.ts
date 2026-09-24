import { z } from 'zod';
import { Id } from './common.js';
import { Message } from './message.js';
import { Channel, Nook, Slug } from './nook.js';

export const SEARCH_MAX_LENGTH = 200;

export const SearchQuery = z.object({
  q: z.string().trim().max(SEARCH_MAX_LENGTH),
  /** Only this nook. */
  nook: Slug.optional(),
  before: Id.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchQuery = z.infer<typeof SearchQuery>;

export interface ParsedSearch {
  /** Words to find, lowercased; each also matches as a prefix ("clim" finds "climbing"). */
  terms: string[];
  /** Words that must not appear (`-word`). */
  excluded: string[];
  /** `in:#channel` (or `in:channel`). */
  in: string | null;
  /** `from:@handle` (or `from:handle`). */
  from: string | null;
}

/**
 * Splits what someone typed into words and filters. Words keep only letters, digits and
 * underscores, so nothing typed can reach the full-text query syntax.
 */
export function parseSearch(q: string): ParsedSearch {
  const out: ParsedSearch = { terms: [], excluded: [], in: null, from: null };
  for (const raw of q.trim().split(/\s+/)) {
    const filter = /^(in|from):[#@]?([\p{L}\p{N}_-]+)$/iu.exec(raw);
    if (filter) {
      out[filter[1]!.toLowerCase() as 'in' | 'from'] = filter[2]!.toLowerCase();
      continue;
    }
    const negated = raw.startsWith('-') && raw.length > 1;
    for (const word of (negated ? raw.slice(1) : raw).toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []) {
      const list = negated ? out.excluded : out.terms;
      if (!list.includes(word)) list.push(word);
    }
  }
  return out;
}

export const SearchHit = z.object({
  message: Message,
  channel: Channel.pick({ id: true, kind: true, name: true, dmUser: true }),
  nook: Nook.pick({ id: true, slug: true, name: true, kit: true }),
});
export type SearchHit = z.infer<typeof SearchHit>;

/** Newest first; `nextCursor` points further back. */
export const SearchResults = z.object({
  items: z.array(SearchHit),
  nextCursor: Id.nullable(),
});
export type SearchResults = z.infer<typeof SearchResults>;
