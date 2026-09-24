"use client";

import { SearchResults } from "@nook/contracts";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "./api";
import { useSession } from "./session";

export const searchKeys = {
  results: (nook: string, q: string) => ["search", nook, q] as const,
};

/** The value, once it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** Messages in one nook matching `q`, newest first, a page at a time. */
export function useSearch(nook: string, q: string, { enabled = true, limit = 20 } = {}) {
  const signedIn = useSession().state.status === "authenticated";
  return useInfiniteQuery({
    queryKey: [...searchKeys.results(nook, q), limit],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ q, nook, limit: String(limit) });
      if (pageParam) params.set("before", pageParam);
      return api(`/search?${params}`, { schema: SearchResults });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: signedIn && enabled && q.trim().length > 0,
    // While a new query is on its way, keep showing the last results instead of flashing empty.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

/**
 * Marks every word that starts with one of the searched terms, the same way the server matched
 * it (prefixes, case-insensitive). Plain text in, React nodes out: never HTML.
 */
export function highlight(text: string, terms: string[]): ReactNode[] {
  if (!terms.length) return [text];
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${escaped.join("|")})[\\p{L}\\p{N}_]*`, "giu");
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(
      <mark key={at} className="rounded-[0.3em] bg-hi px-[0.15em] font-bold text-on-hi">
        {m[0]}
      </mark>,
    );
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** "10:42 PM" today, "Yesterday", "4 Sep", "4 Sep 2025". */
const clock = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" });
const dayYear = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });
export function shortWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return clock.format(d);
  if (d.toDateString() === new Date(now.getTime() - 86_400_000).toDateString()) return "Yesterday";
  return d.getFullYear() === now.getFullYear() ? day.format(d) : dayYear.format(d);
}
