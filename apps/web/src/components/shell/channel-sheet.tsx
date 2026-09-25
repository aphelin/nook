"use client";

import type { Channel, ChannelUnread, NookDetail } from "@nook/contracts";
import { Hash, LockSimple, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { type ReactNode, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { StatusEmoji } from "@/components/people/person-card";
import { usePalette } from "@/components/search/command-palette";
import { Avatar } from "@/components/ui/avatar";
import { usePrefetchChannel } from "@/lib/messages";
import { gsap, reducedMotion } from "@/lib/motion";
import { usePresence } from "@/lib/presence";
import { countLabel, useChannelUnreads } from "@/lib/unread";
import { InvitePopover } from "./invite-popover";
import { NewChannelPopover } from "./new-channel-popover";
import { NewDirectPopover } from "./new-direct-popover";

interface ChannelSheetProps {
  detail: NookDetail;
  activeChannelId: string | null;
  meId: string;
  onNavigate?: () => void;
}

/*
 * Rows are quiet type on the club's deep colour until they have something to say. Unread brings the
 * name up to full white and weight with a count in the pop colour; the row you are in is a solid
 * pill of the room's own colour — a swatch of where you are.
 */
const rowClass =
  "tint group relative flex h-11 items-center gap-2.5 rounded-full px-3.5 text-base hover:bg-hover aria-[current=page]:bg-hi aria-[current=page]:text-on-hi [[data-sliding]_&]:aria-[current=page]:bg-transparent";

/**
 * The pill of where you are slides from the row you left to the row you picked, so moving between
 * channels reads as moving, not as one light going off and another coming on. The server draws the
 * pill on the row itself; once this has measured, the list is marked `data-sliding`, the row lets
 * its own fill go, and this one pill carries it from then on (on resize it just follows the row).
 */
function useSlidingPill(activeId: string | null, layoutKey: string) {
  const list = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const shown = useRef<string | null | undefined>(undefined);
  useLayoutEffect(() => {
    const box = list.current;
    const p = pill.current;
    if (!box || !p) return;
    const place = (animate: boolean) => {
      const row = box.querySelector<HTMLElement>('[aria-current="page"]');
      if (!row) {
        gsap.set(p, { autoAlpha: 0 });
        return;
      }
      const b = box.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      const at = { x: r.left - b.left, y: r.top - b.top + box.scrollTop, width: r.width, height: r.height };
      if (animate) gsap.to(p, { ...at, autoAlpha: 1, duration: 0.42, ease: "nook", overwrite: true });
      else gsap.set(p, { ...at, autoAlpha: 1, overwrite: true });
      box.dataset.sliding = "";
    };
    place(shown.current !== undefined && shown.current !== activeId && !reducedMotion());
    shown.current = activeId;
    // A ResizeObserver reports once as soon as it starts; only a real change of size re-places the pill.
    let size = `${box.clientWidth}x${box.clientHeight}`;
    const resized = new ResizeObserver(() => {
      const now = `${box.clientWidth}x${box.clientHeight}`;
      if (now !== size) place(false);
      size = now;
    });
    resized.observe(box);
    return () => resized.disconnect();
  }, [activeId, layoutKey]);
  return { list, pill };
}

/** "⌘K" on Apple keyboards, "Ctrl K" everywhere else. */
function useShortcutLabel() {
  const mac = useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );
  return mac ? "⌘K" : "Ctrl K";
}

function SectionHeading({ id, children, action }: { id: string; children: string; action: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 pr-1 pl-3.5">
      <h3 id={id} className="text-sm font-bold text-fg-2">
        {children}
      </h3>
      {action}
    </div>
  );
}

/** Spoken after the channel's name: "3 unread, 1 mention". */
function unreadLabel(u: ChannelUnread | undefined, direct: boolean) {
  if (!u || u.unread === 0) return "";
  const mentions = direct ? 0 : u.mentions;
  return `, ${countLabel(u.unread)} unread${mentions ? `, ${countLabel(mentions)} ${mentions === 1 ? "mention" : "mentions"}` : ""}`;
}

function Count({ n }: { n: number }) {
  return (
    // Keyed on the number, so a new count lands again instead of changing in place.
    <span
      key={n}
      aria-hidden="true"
      data-num
      className="pop-in ml-auto inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-pop px-2 text-xs leading-none font-extrabold text-on-pop"
    >
      {countLabel(n)}
    </span>
  );
}

/** A channel's sign: the hash, or a padlock for a private room. */
function ChannelGlyph({ kind }: { kind: Channel["kind"] }) {
  const Icon = kind === "private" ? LockSimple : Hash;
  return (
    <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center opacity-80 group-aria-[current=page]:opacity-100">
      <Icon size={17} weight="bold" />
    </span>
  );
}

export function ChannelSheet({ detail, activeChannelId, meId, onNavigate }: ChannelSheetProps) {
  const { nook, channels, members } = detail;
  const prefetch = usePrefetchChannel();
  const rooms = channels.filter((c) => c.kind !== "direct");
  const presence = usePresence(nook.slug).data ?? {};
  const unreads = useChannelUnreads();
  const palette = usePalette();
  const shortcut = useShortcutLabel();
  const directs = channels.filter((c): c is Channel & { dmUser: NonNullable<Channel["dmUser"]> } => c.kind === "direct" && !!c.dmUser);
  const { list, pill } = useSlidingPill(activeChannelId, `${rooms.length}:${directs.length}`);

  return (
    <nav aria-label={`${nook.name} channels`} className="surface-wing tint flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 flex-col px-5 pt-6 pb-5">
        <h2
          className="line-clamp-2 font-display text-[2rem] leading-[0.95] font-extrabold tracking-[-0.03em] text-balance break-words"
          title={nook.name}
        >
          {nook.name}
        </h2>
        {/* Who's in it, and the way to bring someone else in, on one quiet line under the name. */}
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium text-fg-2">
            {members.length} {members.length === 1 ? "member" : "members"}
          </p>
          <InvitePopover slug={nook.slug} nookName={nook.name} />
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 px-3.5 pb-4">
        {/*
         * Search lives at the top of this column rather than behind an icon in the header: it is
         * the fastest way into an old message, and here it is visible instead of remembered.
         */}
        <button
          type="button"
          onClick={() => palette.open()}
          aria-label="Search and jump"
          aria-keyshortcuts="Control+K Meta+K"
          className="tint flex h-11 w-full items-center gap-2.5 rounded-full bg-chip px-4 text-base text-fg-2 hover:text-fg"
        >
          <MagnifyingGlass size={17} weight="bold" aria-hidden="true" className="shrink-0" />
          <span>Search</span>
          <kbd aria-hidden="true" className="ml-auto font-sans text-xs font-semibold">
            {shortcut}
          </kbd>
        </button>
      </div>

      <div ref={list} className="relative min-h-0 flex-1 overflow-y-auto px-2.5 pb-6">
        {/* Re-tints with the nook on its fill alone; its movement belongs to the slide. */}
        <div
          ref={pill}
          data-current-pill
          aria-hidden="true"
          className="invisible absolute top-0 left-0 rounded-full bg-hi transition-[background-color] duration-[360ms] ease-out-expo"
        />
        <section aria-labelledby="channels-heading">
          <SectionHeading id="channels-heading" action={<NewChannelPopover slug={nook.slug} />}>
            Channels
          </SectionHeading>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {rooms.map((c) => {
              const u = unreads.get(c.id);
              const active = c.id === activeChannelId;
              const unread = active ? 0 : (u?.unread ?? 0);
              return (
                <li key={c.id}>
                  <Link
                    href={`/app/${nook.slug}/${c.id}`}
                    onClick={onNavigate}
                    onPointerEnter={() => prefetch(c.id)}
                    onFocus={() => prefetch(c.id)}
                    aria-current={active ? "page" : undefined}
                    data-unread={unread || undefined}
                    className={`${rowClass} ${active ? "font-bold" : unread ? "font-bold text-fg" : "font-medium text-fg-2"}`}
                  >
                    <ChannelGlyph kind={c.kind} />
                    <span className="truncate">{c.name}</span>
                    <span className="sr-only">
                      {c.kind === "private" ? "Private. " : ""}
                      {active ? "" : unreadLabel(u, false)}
                    </span>
                    {!active && !!u?.mentions && <Count n={u.mentions} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="directs-heading" className="mt-7">
          <SectionHeading id="directs-heading" action={<NewDirectPopover slug={nook.slug} members={members} meId={meId} />}>
            Direct messages
          </SectionHeading>
          {directs.length === 0 ? (
            <p className="mt-1.5 px-3.5 text-sm text-pretty text-fg-2">Start a conversation with anyone in {nook.name}.</p>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {directs.map((c) => {
                const active = c.id === activeChannelId;
                const unread = active ? 0 : (unreads.get(c.id)?.unread ?? 0);
                return (
                  <li key={c.id}>
                    <Link
                      href={`/app/${nook.slug}/${c.id}`}
                      onClick={onNavigate}
                      onPointerEnter={() => prefetch(c.id)}
                      onFocus={() => prefetch(c.id)}
                      aria-current={active ? "page" : undefined}
                      data-unread={unread || undefined}
                      className={`${rowClass} pl-2 ${active ? "font-bold [--face-1:var(--wing-bg)] [--fg-2:var(--wing-on-hi)] [--halo:var(--wing-hi)] [--on-face-1:var(--wing-hi)]" : unread ? "font-bold text-fg" : "font-medium text-fg-2"}`}
                    >
                      <Avatar user={c.dmUser} size={30} presence={presence[c.dmUser.id] ?? "offline"} />
                      <span className="truncate">{c.dmUser.displayName}</span>
                      <StatusEmoji user={c.dmUser} />
                      <span className="sr-only">{active ? "" : unreadLabel(unreads.get(c.id), true)}</span>
                      {!!unread && <Count n={unread} />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </nav>
  );
}
