"use client";

import { Popover } from "@base-ui/react/popover";
import type { Notification } from "@nook/contracts";
import { Tray } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useState } from "react";
import { Mark } from "@/components/brand/mark";
import { NookDisc } from "@/components/brand/nook-disc";
import { Avatar } from "@/components/ui/avatar";
import { countLabel, useMarkNotificationsRead, useNotifications, useUnread } from "@/lib/unread";

const clock = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" });

/** "now", "12m", "3h", "Yesterday", "4 Sep". */
function when(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 12) return `${Math.round(mins / 60)}h`;
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === new Date().toDateString()) return clock.format(d);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return day.format(d);
}

function where(n: Notification) {
  return n.channel.kind === "direct" ? "a direct message" : `#${n.channel.name}`;
}

function headline(n: Notification) {
  const who = n.actor?.displayName ?? "A former member";
  if (n.kind === "reply") return { who, what: ` replied in a thread in ${where(n)}` };
  return { who, what: ` mentioned you in ${where(n)}` };
}

/** Where an item leads: the thread for replies, the message itself for mentions. */
function href(n: Notification) {
  const base = `/app/${n.nook.slug}/${n.channel.id}`;
  return n.message.threadRootId ? `${base}?thread=${n.message.threadRootId}` : `${base}?m=${n.message.id}`;
}

function Item({ n, onOpen }: { n: Notification; onOpen: (n: Notification) => void }) {
  const unread = !n.readAt;
  const { who, what } = headline(n);
  const excerpt = n.message.body || (n.message.attachments.length ? "Shared a file" : "");
  return (
    <li>
      <Link
        href={href(n)}
        onClick={() => onOpen(n)}
        data-unread={unread || undefined}
        className={`grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 rounded-[1.25rem] px-3 py-3 outline-offset-[-2px] transition-colors hover:bg-chip ${unread ? "bg-chip" : ""}`}
      >
        {n.actor ? <Avatar user={n.actor} size={40} /> : <span className="size-10 rounded-full bg-chip" aria-hidden="true" />}
        <span className="min-w-0">
          <span className={`block text-base leading-snug text-pretty ${unread ? "text-fg" : "text-fg-2"}`}>
            <span className={unread ? "font-extrabold" : "font-bold"}>{who}</span>
            {what}
            {unread && <span className="sr-only"> (unread)</span>}
          </span>
          {excerpt && <span className="mt-1 line-clamp-2 block text-base leading-snug break-words">{excerpt}</span>}
          <span className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-fg-2">
            <NookDisc kit={n.nook.kit} initial={n.nook.name[0]} size={16} />
            <span className="truncate">{n.nook.name}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={n.createdAt} className="shrink-0 tabular-nums">
              {when(n.createdAt)}
            </time>
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Mentions and replies from every nook, on the rail so it's one click from anywhere. A card over the colour. */
export function Inbox() {
  const [open, setOpen] = useState(false);
  const count = useUnread().data?.inbox ?? 0;
  const list = useNotifications(open);
  const mark = useMarkNotificationsRead();
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  function onOpen(n: Notification) {
    setOpen(false);
    if (!n.readAt) mark.mutate({ ids: [n.id] });
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={count ? `Inbox, ${countLabel(count)} unread` : "Inbox"}
        className="relative grid size-12 place-items-center rounded-full bg-chip text-on-chip transition-[scale] duration-200 ease-out-expo hover:scale-105 data-[popup-open]:scale-105"
      >
        <Tray size={22} weight="bold" aria-hidden="true" />
        {count > 0 && (
          <span
            key={count}
            aria-hidden="true"
            data-num
            className="pop-in absolute -top-1 -right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-pop px-1.5 text-2xs leading-none font-extrabold text-on-pop ring-[3px] ring-rail"
          >
            {countLabel(count, 100)}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="right" align="end" sideOffset={12} collisionPadding={12} className="z-50">
          <Popover.Popup className="surface-card flex max-h-[min(40rem,calc(100dvh-2rem))] w-[26rem] max-w-[calc(100vw-1.5rem)] origin-[var(--transform-origin)] flex-col rounded-card shadow-float outline-none transition-[scale,opacity] duration-200 ease-out-expo data-[ending-style]:scale-90 data-[ending-style]:opacity-0 data-[starting-style]:scale-90 data-[starting-style]:opacity-0">
            <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-3">
              <Popover.Title className="font-display text-3xl leading-none font-extrabold tracking-[-0.03em]">Inbox</Popover.Title>
              <button
                type="button"
                disabled={count === 0}
                onClick={() => mark.mutate({ all: true })}
                className="rounded-full bg-chip px-3.5 py-2 text-sm font-bold text-on-chip transition-opacity disabled:cursor-default disabled:opacity-50"
              >
                Mark all read
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
              {list.isPending ? (
                <div aria-busy="true" aria-label="Loading your inbox" className="h-40" />
              ) : list.isError ? (
                <div className="px-3 py-8">
                  <p className="text-base">Couldn’t load your inbox.</p>
                  <button
                    type="button"
                    onClick={() => void list.refetch()}
                    className="mt-3 rounded-full bg-hi px-4 py-2 text-sm font-bold text-on-hi"
                  >
                    Try again
                  </button>
                </div>
              ) : items.length === 0 ? (
                <div className="px-3.5 pt-6 pb-10">
                  <Mark size={64} variant="kit" className="pop-in mb-5" />
                  <p className="font-display text-2xl leading-none font-extrabold tracking-[-0.02em]">All caught up</p>
                  <p className="mt-2.5 max-w-[30ch] text-base text-pretty text-fg-2">
                    When someone @mentions you or replies in your thread, it lands here.
                  </p>
                </div>
              ) : (
                <ul aria-label="Notifications" className="flex flex-col gap-px">
                  {items.map((n) => (
                    <Item key={n.id} n={n} onOpen={onOpen} />
                  ))}
                </ul>
              )}
              {list.hasNextPage && (
                <button
                  type="button"
                  onClick={() => void list.fetchNextPage()}
                  disabled={list.isFetchingNextPage}
                  className="mx-2.5 my-2 rounded-full bg-chip px-4 py-2 text-sm font-bold text-on-chip"
                >
                  {list.isFetchingNextPage ? "Loading…" : "Show older"}
                </button>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
