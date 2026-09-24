"use client";

import { parseSearch, SEARCH_MAX_LENGTH } from "@nook/contracts";
import { MagnifyingGlass, X } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useState } from "react";
import { Mark } from "@/components/brand/mark";
import { useChat } from "@/components/chat/chat-context";
import { Avatar } from "@/components/ui/avatar";
import { highlight, shortWhen, useSearch } from "@/lib/search";
import { hitHref, hitWhere } from "./command-palette";

interface SearchPanelProps {
  slug: string;
  nookName: string;
  query: string;
  /** The message currently in view, so its result stays marked. */
  focusedId: string | null;
  onQueryChange: (q: string) => void;
  onClose: () => void;
}

/** Every match in the nook, newest first, beside the conversation: pick one and the transcript goes to it. */
export function SearchPanel({ slug, nookName, query, focusedId, onQueryChange, onClose }: SearchPanelProps) {
  const { members } = useChat();
  const [draft, setDraft] = useState(query);
  const results = useSearch(slug, query);
  const hits = results.data?.pages.flatMap((p) => p.items) ?? [];
  const { terms, in: inChannel, from } = parseSearch(query);

  return (
    <aside aria-labelledby="search-heading" className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 items-center gap-3 pt-6 pr-3 pb-2 pl-6">
        <h2 id="search-heading" className="font-display text-2xl leading-none font-extrabold tracking-[-0.03em]">
          Search
        </h2>
        <span className="min-w-0 truncate text-sm font-semibold text-fg-2">{nookName}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          className="ml-auto grid size-10 shrink-0 place-items-center rounded-full bg-chip text-on-chip transition-[scale] duration-200 ease-out-expo hover:scale-105"
        >
          <X size={20} weight="bold" aria-hidden="true" />
        </button>
      </div>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) onQueryChange(draft.trim());
        }}
        className="shrink-0 px-4 pt-2 pb-3"
      >
        <div className="flex h-12 items-center gap-2.5 rounded-full bg-chip px-4 text-on-chip transition-[box-shadow] duration-150 focus-within:inset-ring-2 focus-within:inset-ring-hi">
          <MagnifyingGlass size={18} weight="bold" aria-hidden="true" className="shrink-0 text-fg-2" />
          <input
            type="search"
            value={draft}
            maxLength={SEARCH_MAX_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={`Search messages in ${nookName}`}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-md outline-none placeholder:text-fg-2"
          />
        </div>
        {(inChannel || from) && (
          <p className="mt-2 text-sm text-fg-2">
            {inChannel && (
              <>
                In <span className="font-semibold text-fg">#{inChannel}</span>
              </>
            )}
            {inChannel && from && " · "}
            {from && (
              <>
                From <span className="font-semibold text-fg">@{from}</span>
              </>
            )}
          </p>
        )}
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2" aria-busy={results.isFetching || undefined}>
        <p aria-live="polite" className="sr-only">
          {results.isPending ? "Searching" : `${hits.length}${results.hasNextPage ? " or more" : ""} results`}
        </p>
        {results.isPending ? (
          <div className="h-24" />
        ) : results.isError ? (
          <div className="px-3 py-6">
            <p className="text-base">Couldn’t search right now.</p>
            <button
              type="button"
              onClick={() => void results.refetch()}
              className="mt-3 rounded-full bg-hi px-4 py-2 text-sm font-bold text-on-hi"
            >
              Try again
            </button>
          </div>
        ) : hits.length === 0 ? (
          <div className="px-3 pt-6 pb-8">
            <Mark size={64} variant="kit" className="pop-in mb-5" />
            <p className="font-display text-2xl leading-none font-extrabold tracking-[-0.02em]">Nothing found</p>
            <p className="mt-2.5 text-base text-pretty text-fg-2">
              No messages in {nookName} match “{query}”. Words match from their start, so try a shorter word, or drop a filter.
            </p>
          </div>
        ) : (
          <ol aria-label="Results" className="flex flex-col gap-px">
            {hits.map((hit) => {
              const author = hit.message.authorId ? members.get(hit.message.authorId) : undefined;
              const where = hitWhere(hit);
              const current = hit.message.id === focusedId;
              return (
                <li key={hit.message.id}>
                  <Link
                    href={hitHref(hit, query)}
                    scroll={false}
                    aria-current={current || undefined}
                    className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 rounded-[1.25rem] px-3 py-3 outline-offset-[-2px] transition-colors hover:bg-chip aria-[current=true]:bg-chip"
                  >
                    {author ? <Avatar user={author} size={36} /> : <span className="size-9 rounded-full bg-chip" aria-hidden="true" />}
                    <span className="min-w-0">
                      <span className="flex items-baseline gap-2 text-sm text-fg-2">
                        <span className="truncate font-extrabold text-fg">{author?.displayName ?? "Former member"}</span>
                        <span className="truncate">
                          {where}
                          {hit.message.threadRootId ? " · thread" : ""}
                        </span>
                        <time dateTime={hit.message.createdAt} className="ml-auto shrink-0 tabular-nums">
                          {shortWhen(hit.message.createdAt)}
                        </time>
                      </span>
                      <span className="mt-1 line-clamp-3 block text-base leading-snug break-words">
                        {highlight(hit.message.body || "Shared a file", terms)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
        {results.hasNextPage && (
          <button
            type="button"
            onClick={() => void results.fetchNextPage()}
            disabled={results.isFetchingNextPage}
            className="mx-2.5 my-3 rounded-full bg-chip px-4 py-2 text-sm font-bold text-on-chip"
          >
            {results.isFetchingNextPage ? "Loading…" : "Show older results"}
          </button>
        )}
      </div>
    </aside>
  );
}
