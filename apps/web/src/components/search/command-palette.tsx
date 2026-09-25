"use client";

import { Dialog } from "@base-ui/react/dialog";
import { type ManualStatus, type NookDetail, parseSearch, type PublicUser, type SearchHit } from "@nook/contracts";
import {
  ArrowRight,
  ChatCircle,
  Checks,
  Hash,
  LockSimple,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  SignOut,
} from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { Mark } from "@/components/brand/mark";
import { NookDisc } from "@/components/brand/nook-disc";
import { directionOf, shownNook, turn } from "@/components/shell/story-turn";
import { useProfileEditor } from "@/components/people/profile-dialog";
import { Avatar } from "@/components/ui/avatar";
import { PresenceShape } from "@/components/ui/presence-shape";
import { chooseStatus, useManualStatus } from "@/lib/presence";
import { useNooks, useOpenDirect } from "@/lib/queries";
import { useRealtime } from "@/lib/realtime";
import { highlight, shortWhen, useDebounced, useSearch } from "@/lib/search";
import { useSession } from "@/lib/session";
import { useChannelUnreads, useMarkNotificationsRead } from "@/lib/unread";

interface PaletteControls {
  open(query?: string): void;
}
const PaletteContext = createContext<PaletteControls | null>(null);

/** Opens the command palette from anywhere in the shell (the header's search button, for one). */
export function usePalette(): PaletteControls {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error("usePalette must be used inside <CommandPalette>");
  return ctx;
}

type Group = "Jump to" | "People" | "Messages" | "Actions";
const GROUP_ORDER: Group[] = ["Jump to", "People", "Messages", "Actions"];

interface Item {
  id: string;
  group: Group;
  /** What the query is matched against, and the option's name for screen readers. */
  label: string;
  content: ReactNode;
  run: () => void | Promise<void>;
}

const MESSAGE_PREVIEW = 5;

/** Every word of the query starts some word of the label: "tr pl" finds "trip-planning". */
function matches(label: string, words: string[]) {
  const parts = label.toLowerCase().split(/[\s\-_#@]+/);
  return words.every((w) => parts.some((p) => p.startsWith(w)));
}

const optionText = "min-w-0 flex-1 truncate";
const hintText = "shrink-0 text-sm text-fg-2";

function MessageHitContent({
  hit,
  terms,
  author,
}: {
  hit: SearchHit;
  terms: string[];
  author: Pick<PublicUser, "displayName" | "handle" | "avatarUrl" | "face"> | undefined;
}) {
  const where = hitWhere(hit);
  return (
    <span className="flex min-w-0 flex-1 gap-3 py-0.5">
      {author ? <Avatar user={author} size={28} className="mt-0.5" /> : <span className="mt-0.5 size-7 shrink-0 rounded-full bg-chip" />}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2 text-sm text-fg-2">
          <span className="truncate font-extrabold text-fg">{author?.displayName ?? "Former member"}</span>
          <span className="truncate">
            {where}
            {hit.message.threadRootId ? " · in a thread" : ""}
          </span>
          <time dateTime={hit.message.createdAt} className="ml-auto shrink-0 tabular-nums">
            {shortWhen(hit.message.createdAt)}
          </time>
        </span>
        <span className="mt-0.5 line-clamp-2 block text-base leading-snug break-words">
          {highlight(hit.message.body || "Shared a file", terms)}
        </span>
      </span>
    </span>
  );
}

/** "#general", or "DM with Jonas": the author's full name sits right beside it. */
export function hitWhere(hit: SearchHit) {
  return hit.channel.kind === "direct"
    ? `DM with ${hit.channel.dmUser?.displayName.split(" ")[0] ?? "a former member"}`
    : `#${hit.channel.name}`;
}

/** Where a hit lives: its thread for a reply, otherwise the message in its channel. */
export function hitHref(hit: SearchHit, keepQuery?: string) {
  const base = `/app/${hit.nook.slug}/${hit.channel.id}`;
  if (hit.message.threadRootId) return `${base}?thread=${hit.message.threadRootId}`;
  const params = new URLSearchParams(keepQuery ? { q: keepQuery, m: hit.message.id } : { m: hit.message.id });
  return `${base}?${params}`;
}

interface CommandPaletteProps {
  detail: NookDetail;
  meId: string;
  children: ReactNode;
}

/**
 * Cmd/Ctrl+K: one box to jump to a channel, a person or another nook, run an action, or find a
 * message. Arrows move, Enter runs, Escape closes. Typing `in:#channel` or `from:@name` narrows it
 * to message search.
 */
export function CommandPalette({ detail, meId, children }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const controls = useMemo<PaletteControls>(
    () => ({
      open: (q = "") => {
        setQuery(q);
        setOpen(true);
      },
    }),
    [],
  );

  // Cmd+K on macOS, Ctrl+K elsewhere; it works from inside the composer too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setOpen((was) => {
          if (!was) setQuery("");
          return !was;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <PaletteContext value={controls}>
      {children}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          {/* Base UI unmounts the popup once it has finished closing, so each opening starts fresh. */}
          <PaletteBody detail={detail} meId={meId} query={query} setQuery={setQuery} close={() => setOpen(false)} />
        </Dialog.Portal>
      </Dialog.Root>
    </PaletteContext>
  );
}

interface PaletteBodyProps {
  detail: NookDetail;
  meId: string;
  query: string;
  setQuery: (q: string) => void;
  close: () => void;
}

function PaletteBody({ detail, meId, query, setQuery, close }: PaletteBodyProps) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const slug = detail.nook.slug;
  const nooks = useNooks().data ?? [];
  const unreads = useChannelUnreads();
  const openDirect = useOpenDirect(slug);
  const markAll = useMarkNotificationsRead();
  const { socket } = useRealtime();
  const { signOut } = useSession();
  const status = useManualStatus();
  const editor = useProfileEditor();
  const members = useMemo(() => new Map(detail.members.map((m) => [m.id, m])), [detail.members]);

  const parsed = parseSearch(query);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtering = !!parsed.in || !!parsed.from;
  // Messages need a word of two letters or a filter; a single letter would match half the nook.
  const searchable = filtering || parsed.terms.some((t) => t.length >= 2);
  const settled = useDebounced(searchable ? query.trim() : "", 180);
  const search = useSearch(slug, settled, { enabled: settled.length > 0, limit: MESSAGE_PREVIEW });
  const hits = searchable && settled ? (search.data?.pages[0]?.items ?? []) : [];

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  const items = (() => {
    const out: Item[] = [];
    if (!filtering) {
      const rooms = detail.channels.filter((c) => c.kind !== "direct");
      const directs = detail.channels.filter((c) => c.kind === "direct" && c.dmUser);
      const jump: Item[] = [
        ...rooms.map((c) => {
          const u = unreads.get(c.id);
          const Icon = c.kind === "private" ? LockSimple : Hash;
          return {
            id: `channel-${c.id}`,
            group: "Jump to" as const,
            label: `#${c.name}`,
            content: (
              <>
                <Icon size={18} weight="bold" aria-hidden="true" className="shrink-0 text-fg-2" />
                <span className={`${optionText} text-md leading-none ${u?.unread ? "font-extrabold" : "font-semibold"}`}>{c.name}</span>
                {u?.unread ? <span className={hintText}>{u.mentions ? `${u.mentions} for you` : "Unread"}</span> : null}
              </>
            ),
            run: () => go(`/app/${slug}/${c.id}`),
          };
        }),
        ...directs.map((c) => ({
          id: `dm-${c.id}`,
          group: "Jump to" as const,
          label: c.dmUser!.displayName,
          content: (
            <>
              <Avatar user={c.dmUser!} size={20} />
              <span className={optionText}>{c.dmUser!.displayName}</span>
              <span className={hintText}>Direct message</span>
            </>
          ),
          run: () => go(`/app/${slug}/${c.id}`),
        })),
        ...nooks
          .filter((n) => n.slug !== slug)
          .map((n) => ({
            id: `nook-${n.id}`,
            group: "Jump to" as const,
            label: n.name,
            content: (
              <>
                <NookDisc kit={n.kit} initial={n.name[0]} size={24} />
                <span className={optionText}>{n.name}</span>
                <span className={hintText}>Nook</span>
              </>
            ),
            run: () => {
              const from = nooks.findIndex((x) => x.slug === detail.nook.slug);
              void turn(directionOf(from, nooks.indexOf(n)), async () => {
                go(`/app/${n.slug}`);
                await shownNook(n.slug);
              });
            },
          })),
      ];
      // With nothing typed: unread channels first, then the rest, as a quick switcher.
      const jumpShown = words.length
        ? jump.filter((i) => matches(i.label, words))
        : [
            ...jump.filter((i) => i.id.startsWith("channel-") && unreads.get(i.id.slice(8))?.unread),
            ...jump.filter((i) => !(i.id.startsWith("channel-") && unreads.get(i.id.slice(8))?.unread)),
          ];
      out.push(...jumpShown.slice(0, words.length ? 8 : 7));

      if (words.length) {
        const people = detail.members
          .filter((m) => m.id !== meId && (matches(m.displayName, words) || matches(`@${m.handle}`, words)))
          .slice(0, 4)
          .map<Item>((m) => ({
            id: `person-${m.id}`,
            group: "People",
            label: `Message ${m.displayName}`,
            content: (
              <>
                <ChatCircle size={18} weight="bold" aria-hidden="true" className="shrink-0 text-fg-2" />
                <span className={optionText}>
                  Message <span className="font-semibold">{m.displayName}</span>
                </span>
                <span className={hintText}>@{m.handle}</span>
              </>
            ),
            run: async () => {
              const channel = await openDirect.mutateAsync(m.id);
              go(`/app/${slug}/${channel.id}`);
            },
          }));
        out.push(...people);
      }
    }

    out.push(
      ...hits.map<Item>((hit) => {
        const author = hit.message.authorId ? members.get(hit.message.authorId) : undefined;
        return {
          id: `hit-${hit.message.id}`,
          group: "Messages",
          label: `${author?.displayName ?? "Former member"}: ${hit.message.body}`,
          content: <MessageHitContent hit={hit} terms={parsed.terms} author={author} />,
          run: () => go(hitHref(hit)),
        };
      }),
    );
    if (hits.length) {
      out.push({
        id: "all-results",
        group: "Messages",
        label: `See all results for ${query.trim()}`,
        content: (
          <>
            <MagnifyingGlass size={18} weight="bold" aria-hidden="true" className="shrink-0 text-fg-2" />
            <span className={optionText}>
              See all results for <span className="font-semibold">“{query.trim()}”</span>
            </span>
            <ArrowRight size={16} weight="bold" aria-hidden="true" className="shrink-0 text-fg-2" />
          </>
        ),
        run: () => {
          close();
          const url = new URL(window.location.href);
          url.searchParams.delete("thread");
          url.searchParams.delete("m");
          url.searchParams.set("q", query.trim());
          router.push(`${url.pathname}?${url.searchParams}`);
        },
      });
    }

    if (!filtering) {
      const statuses: { value: ManualStatus; label: string }[] = [
        { value: "online", label: "Set status: Automatic" },
        { value: "away", label: "Set status: Away" },
        { value: "dnd", label: "Set status: Do not disturb" },
      ];
      const actions: Item[] = [
        ...statuses
          .filter((s) => s.value !== status)
          .map<Item>((s) => ({
            id: `status-${s.value}`,
            group: "Actions",
            label: s.label,
            content: (
              <>
                <PresenceShape state={s.value} size={14} />
                <span className={optionText}>{s.label}</span>
              </>
            ),
            run: () => {
              close();
              void chooseStatus(socket, s.value);
            },
          })),
        {
          id: "edit-profile",
          group: "Actions",
          label: "Edit profile",
          content: (
            <>
              <PencilSimple size={18} weight="bold" aria-hidden="true" className="shrink-0 text-fg-2" />
              <span className={optionText}>Edit profile</span>
            </>
          ),
          run: () => {
            close();
            editor.open();
          },
        },
        {
          id: "mark-all-read",
          group: "Actions",
          label: "Mark all notifications read",
          content: (
            <>
              <Checks size={18} weight="bold" aria-hidden="true" className="shrink-0 text-fg-2" />
              <span className={optionText}>Mark all notifications read</span>
            </>
          ),
          run: () => {
            close();
            markAll.mutate({ all: true });
          },
        },
        {
          id: "new-nook",
          group: "Actions",
          label: "Start a nook",
          content: (
            <>
              <Plus size={18} weight="bold" aria-hidden="true" className="shrink-0 text-fg-2" />
              <span className={optionText}>Start a nook</span>
            </>
          ),
          run: () => go("/app/new"),
        },
        {
          id: "sign-out",
          group: "Actions",
          label: "Sign out",
          content: (
            <>
              <SignOut size={18} weight="bold" aria-hidden="true" className="shrink-0 text-fg-2" />
              <span className={optionText}>Sign out</span>
            </>
          ),
          run: () => {
            close();
            void signOut();
          },
        },
      ];
      out.push(...(words.length ? actions.filter((a) => matches(a.label, words)) : actions));
    }
    return out;
  })();

  const [active, setActive] = useState(0);
  const index = items.length ? Math.min(active, items.length - 1) : -1;
  const activeItem = index >= 0 ? items[index] : undefined;
  const optionId = (id: string) => `${listId}-${id}`;

  // New results put the highlight back on the first option.
  const firstId = items[0]?.id;
  const [seenFirst, setSeenFirst] = useState(firstId);
  if (seenFirst !== firstId) {
    setSeenFirst(firstId);
    setActive(0);
  }

  const activeDomId = activeItem ? optionId(activeItem.id) : undefined;
  useEffect(() => {
    if (activeDomId) document.getElementById(activeDomId)?.scrollIntoView({ block: "nearest" });
  }, [activeDomId]);

  const [error, setError] = useState<string | null>(null);
  async function run(item: Item) {
    setError(null);
    try {
      await item.run();
    } catch {
      setError("That didn’t work. Try again.");
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing || !items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((index + step + items.length) % items.length);
    } else if (e.key === "Home" && e.ctrlKey) {
      setActive(0);
    } else if (e.key === "End" && e.ctrlKey) {
      setActive(items.length - 1);
    } else if (e.key === "Enter" && activeItem) {
      e.preventDefault();
      void run(activeItem);
    }
  }

  const groups = GROUP_ORDER.map((g) => ({ group: g, items: items.filter((i) => i.group === g) })).filter((g) => g.items.length);
  const searching = searchable && (settled !== query.trim() || search.isFetching) && !hits.length;
  const noMessages = searchable && !searching && settled === query.trim() && search.isSuccess && !hits.length;
  const nothing = words.length > 0 && items.length === 0 && !searching;

  return (
    <Dialog.Popup
      initialFocus={input}
      className="surface-card fixed top-[max(1rem,12vh)] left-1/2 z-50 flex max-h-[min(40rem,calc(100dvh-2rem))] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-card shadow-float outline-none transition-[opacity,scale] duration-200 ease-out-expo data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
    >
      <Dialog.Title className="sr-only">Command palette</Dialog.Title>
      <div className="m-2.5 mb-0 flex items-center gap-3 rounded-full bg-chip px-5 text-on-chip">
        <MagnifyingGlass size={21} weight="bold" aria-hidden="true" className="shrink-0" />
        <input
          ref={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-label="Jump to, search or run a command"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeDomId}
          placeholder="Jump to a channel, find a message, or run a command"
          spellCheck={false}
          autoComplete="off"
          className="h-14 min-w-0 flex-1 bg-transparent text-lg font-medium outline-none placeholder:text-fg-2"
        />
        <kbd className="hidden shrink-0 rounded-full bg-bg px-2.5 py-1 font-sans text-xs font-bold text-fg-2 sm:block">Esc</kbd>
      </div>

      <div ref={list} id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-2">
        {groups.map(({ group, items: groupItems }) => (
          <div key={group} role="group" aria-labelledby={`${listId}-${group}`} className="pb-1">
            <div id={`${listId}-${group}`} role="presentation" className="px-3.5 pt-3 pb-1.5 text-xs font-bold text-fg-2">
              {group}
            </div>
            {groupItems.map((item) => {
              const selected = item.id === activeItem?.id;
              return (
                <div
                  key={item.id}
                  id={optionId(item.id)}
                  role="option"
                  aria-selected={selected}
                  aria-label={item.label}
                  onMouseMove={() => !selected && setActive(items.indexOf(item))}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void run(item)}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-full px-3.5 py-1.5 ${selected ? "bg-hi text-on-hi [--face-2:var(--on-hi)] [--fg:var(--on-hi)] [--fg-2:var(--on-hi)] [--halo:var(--hi)] [--on-face-2:var(--hi)] [&_mark]:bg-on-hi [&_mark]:text-hi" : ""}`}
                >
                  {item.content}
                </div>
              );
            })}
          </div>
        ))}
        {searching && groups.every((g) => g.group !== "Messages") && (
          <p className="px-3.5 py-2.5 text-base text-fg-2">Searching messages…</p>
        )}
        {noMessages && !nothing && <p className="px-3.5 py-2.5 text-base text-fg-2">No messages match “{query.trim()}”.</p>}
        {nothing && (
          <div className="px-3.5 pt-6 pb-8">
            <Mark size={64} variant="kit" className="pop-in mb-5" />
            <p className="font-display text-2xl leading-none font-extrabold tracking-[-0.02em]">No matches</p>
            <p className="mt-2.5 text-base text-pretty text-fg-2">
              Nothing in {detail.nook.name} matches “{query.trim()}”. Try fewer letters, or another word.
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="field-error px-3 py-2 text-sm font-medium text-alert">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-chip px-5 py-3 text-sm text-fg-2">
        <span>
          <kbd className="font-sans font-semibold text-fg">↑↓</kbd> move · <kbd className="font-sans font-semibold text-fg">Enter</kbd> open
        </span>
        <span className="ml-auto">
          Narrow messages with <code className="font-mono text-sm text-fg">in:#channel</code>{" "}
          <code className="font-mono text-sm text-fg">from:@name</code>
        </span>
      </div>
      <p aria-live="polite" className="sr-only">
        {nothing ? "No matches" : searching ? "Searching" : `${items.length} results`}
      </p>
    </Dialog.Popup>
  );
}
