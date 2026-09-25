"use client";

import type { NookDetail } from "@nook/contracts";
import { ArrowDown } from "@phosphor-icons/react/dist/ssr";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { flatten, type useMessages, type useSendMessage } from "@/lib/messages";
import { viewing } from "@/lib/unread";
import { useTabVisible } from "@/lib/visibility";
import { TranscriptSkeleton } from "@/components/shell/shell-skeleton";
import { MessageRow } from "./message-row";
import { type Row, toRows } from "./rows";

// Virtuoso counts rows from this index so older pages can be prepended without the view jumping.
const START_INDEX = 1_000_000;
/** How far back a link to an old message will page (50 messages a page). */
const MAX_PAGES_TO_FIND = 40;

const dayFormat = new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long" });
function dayLabel(d: Date) {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return dayFormat.format(d);
}

/** What the list's header needs, passed through Virtuoso's context so the parts can stay stable. */
interface ListContext {
  hasOlder: boolean;
  fetchingOlder: boolean;
  intro: ReactNode;
}

/*
 * The list's header and footer, defined once. Passed inline, they were new components on every
 * render, so each arriving message remounted the channel's intro and the list re-laid its ends.
 */
const LIST_PARTS = {
  Header: ({ context }: { context?: ListContext }) =>
    context?.hasOlder ? (
      <p className="px-8 py-6 text-sm font-semibold text-fg-2">{context.fetchingOlder ? "Loading earlier messages…" : " "}</p>
    ) : (
      <div className="px-5 pt-8 pb-8 md:px-8">{context?.intro}</div>
    ),
  Footer: () => <div className="h-5" />,
};

interface TranscriptProps {
  query: ReturnType<typeof useMessages>;
  sender: ReturnType<typeof useSendMessage>;
  detail: NookDetail;
  meId: string;
  label: string;
  intro: ReactNode;
  editingId: string | null;
  onEditingChange: (id: string | null) => void;
  /** Bumped whenever you send: your own message always brings you to the bottom. */
  sentCount: number;
  channelId: string;
  /** Your read pointer as it is now; undefined while it loads. The "new" line uses its value at first sight. */
  lastReadId: string | null | undefined;
  /** Called with the latest message while you're at the bottom of a visible tab. */
  onRead: (messageId: string) => void;
  /** A message to bring into view and flash, e.g. when arriving from the inbox. */
  focusId: string | null;
}

export function Transcript({
  query,
  sender,
  detail,
  meId,
  label,
  intro,
  editingId,
  onEditingChange,
  sentCount,
  channelId,
  lastReadId,
  onRead,
  focusId,
}: TranscriptProps) {
  const messages = useMemo(() => flatten(query.data), [query.data]);
  // Where you left off, captured once: the "new" line stays put while you read on.
  const [newAfter, setNewAfter] = useState<string | null | undefined>(undefined);
  if (newAfter === undefined && lastReadId !== undefined) setNewAfter(lastReadId);
  const rows = useMemo(() => toRows(messages, { newAfter, meId }), [messages, newAfter, meId]);
  const members = useMemo(() => new Map(detail.members.map((m) => [m.id, m])), [detail.members]);
  const list = useRef<VirtuosoHandle>(null);
  const scroller = useRef<HTMLElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  /*
   * Opening a channel without the glitch.
   *
   * Virtuoso needs a few frames to open a list: it measures its viewport, renders from estimated
   * row heights, measures the rows and corrects. Shown as it went, every switch flickered: the
   * channel's intro alone, the list scrolled short with "Jump to latest" up, then a jump to the
   * bottom. So the list stays hidden until it has settled (the newest row drawn, the view resting
   * on the floor of the list, nothing resizing for two frames) and then fades in. Arriving at a
   * particular message from the inbox or search settles wherever that message is instead. Never
   * longer than half a second.
   *
   * (A plain-DOM stand-in for those frames was tried and dropped: it put every message on the page
   * twice for a moment, which anything reading the page's text, from find-in-page to the tests,
   * could see.)
   */
  const [painted, setPainted] = useState(false);
  const listMounted = !query.isPending && !query.isError;
  // The newest row the list has drawn, and the newest row there is. A short channel sits on its
  // floor before a single row is drawn (the intro alone fits), so resting isn't enough on its own.
  const drawnLast = useRef<string | undefined>(undefined);
  const newest = rows.at(-1)?.key;
  useEffect(() => {
    if (!listMounted || painted) return;
    const started = performance.now();
    let frame = 0;
    let lastHeight = -1;
    let still = 0;
    const check = () => {
      const el = scroller.current;
      const drawn = drawnLast.current === newest;
      const resting = !!el && drawn && (!!focusId || el.scrollHeight - el.scrollTop - el.clientHeight <= 2);
      still = resting && el.scrollHeight === lastHeight ? still + 1 : 0;
      lastHeight = el?.scrollHeight ?? -1;
      if (still >= 2 || performance.now() - started > 500) setPainted(true);
      else frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, [listMounted, painted, focusId, newest]);

  // The oldest message at first load anchors the index maths: rows before it were prepended later.
  const [anchor, setAnchor] = useState<string | null>(null);
  if (anchor === null && rows.length > 0) {
    const first = rows.find((r) => r.kind === "message");
    if (first) setAnchor(first.key);
  }
  const anchorIndex = Math.max(
    0,
    rows.findIndex((r) => r.key === anchor),
  );
  const firstItemIndex = START_INDEX - anchorIndex;

  useEffect(() => {
    if (sentCount > 0) list.current?.scrollToIndex({ index: "LAST", behavior: "auto" });
  }, [sentCount]);

  // The composer growing (a longer message, an attachment) takes height from the list's bottom
  // edge. Resting on the newest message, the list keeps its floor there instead of letting the
  // composer cover it; scrolled up to read, it is left where it is.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !listMounted) return;
    let floor = el.scrollHeight - el.scrollTop - el.clientHeight <= 4;
    let height = el.clientHeight;
    const onScroll = () => {
      floor = el.scrollHeight - el.scrollTop - el.clientHeight <= 4;
    };
    const resized = new ResizeObserver(() => {
      if (el.clientHeight < height && floor) el.scrollTop = el.scrollHeight;
      height = el.clientHeight;
    });
    el.addEventListener("scroll", onScroll, { passive: true });
    resized.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      resized.disconnect();
    };
  }, [listMounted]);

  // Reading: at the bottom of a visible tab, the latest saved message is read, and so is anything
  // that arrives while you stay there.
  const visible = useTabVisible();
  const reading = atBottom && visible && newAfter !== undefined && !query.isPending;
  const latestSaved = messages.findLast((m) => !m.status)?.id;
  useEffect(() => {
    if (!reading) return;
    viewing.channelId = channelId;
    if (latestSaved) onRead(latestSaved);
    return () => {
      if (viewing.channelId === channelId) viewing.channelId = null;
    };
  }, [reading, latestSaved, channelId, onRead]);

  // Arriving at a particular message: centre it once it's loaded, and flash it.
  const focusIndex = focusId ? rows.findIndex((r) => r.kind === "message" && r.message.id === focusId) : -1;
  // Older than anything loaded? Ids are time-ordered, so keep paging back until it turns up (within reason).
  const oldestLoaded = messages.find((m) => !m.status)?.id;
  const needOlder =
    !!focusId &&
    focusIndex < 0 &&
    !!oldestLoaded &&
    focusId < oldestLoaded &&
    query.hasNextPage &&
    !query.isFetchingNextPage &&
    (query.data?.pages.length ?? 0) < MAX_PAGES_TO_FIND;
  useEffect(() => {
    if (needOlder) void query.fetchNextPage();
  }, [needOlder, query]);
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (focusIndex < 0 || !focusId || focused.current === focusId) return;
    // Virtuoso measures rows as they render, and rows it just prepended shift everything, so one
    // scroll can land short. Scroll, check the row is really on screen, and try again if not.
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      const row = scroller.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(focusId)}"]`);
      const view = scroller.current?.getBoundingClientRect();
      const box = row?.getBoundingClientRect();
      if (row && view && box && box.top >= view.top && box.bottom <= view.bottom) {
        focused.current = focusId;
        return;
      }
      if (++tries > 12) return;
      list.current?.scrollToIndex({ index: focusIndex, align: "center", behavior: "auto" });
      timer = setTimeout(attempt, 80);
    };
    timer = setTimeout(attempt, 0);
    return () => clearTimeout(timer);
  }, [focusIndex, focusId]);

  // Tell screen readers about new messages from other people as they arrive.
  const [announcement, setAnnouncement] = useState("");
  const lastSeen = useRef<string | null>(null);
  useEffect(() => {
    const latest = messages.at(-1);
    if (!latest || latest.id === lastSeen.current) return;
    const first = lastSeen.current === null;
    lastSeen.current = latest.id;
    if (first || latest.authorId === meId || latest.kind !== "user") return;
    setAnnouncement(`${members.get(latest.authorId ?? "")?.displayName ?? "Someone"}: ${latest.body}`);
  }, [messages, meId, members]);

  if (query.isPending) {
    return (
      <div aria-busy="true" className="flex min-h-0 flex-1 flex-col">
        <p role="status" className="sr-only">
          Loading messages…
        </p>
        <TranscriptSkeleton />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="flex flex-1 flex-col items-start justify-end gap-3 px-8 pb-10">
        <p className="font-display text-2xl font-extrabold tracking-[-0.02em]">Couldn’t load messages.</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="rounded-full bg-hi px-5 py-2.5 text-base font-bold text-on-hi"
        >
          Try again
        </button>
      </div>
    );
  }

  const renderRow = (row: Row) =>
    row.kind === "new" ? (
      <div className="flex items-center gap-3 px-5 pt-5 pb-1 md:px-8" role="separator" aria-label="New messages">
        <span className="tint h-[3px] flex-1 rounded-full bg-hi" aria-hidden="true" />
        <span className="tint pop-in rounded-full bg-hi px-3 py-1.5 text-xs leading-none font-extrabold text-on-hi">New</span>
      </div>
    ) : row.kind === "day" ? (
      // A day is a heading in the room's own voice, big enough to scroll by.
      <div className="flex items-baseline gap-4 px-5 pt-8 pb-1 md:px-8" role="separator" aria-label={dayLabel(row.date)}>
        <span className="font-display text-xl leading-none font-extrabold tracking-[-0.02em] text-title">{dayLabel(row.date)}</span>
        <span className="h-[2px] flex-1 translate-y-[-0.3em] rounded-full bg-line" aria-hidden="true" />
      </div>
    ) : (
      // Space between runs is padding on the list row, never a margin: a margin collapses outside the
      // row, and the virtual list, which measures rows by their box, drifts off the bottom.
      <div
        className={`px-2 md:px-5 ${row.grouped ? "" : "pt-2"} ${row.message.id === focusId ? "settle" : ""} ${row.message.status === "sending" ? "arrive" : ""}`}
      >
        <MessageRow
          message={row.message}
          grouped={row.grouped}
          editing={editingId === row.message.id}
          onEditChange={(on) => onEditingChange(on ? row.message.id : null)}
          onRetry={() => sender.retry(row.message)}
          onDiscard={() => sender.discard(row.message)}
        />
      </div>
    );

  return (
    <section aria-label={label} className="relative flex min-h-0 flex-1 flex-col">
      <Virtuoso<Row, ListContext>
        ref={list}
        scrollerRef={(el) => {
          scroller.current = el instanceof HTMLElement ? el : null;
        }}
        // Hidden (not merely transparent) while it settles, so nothing half-laid-out is ever on screen,
        // then faded in.
        className={`flex-1 transition-opacity duration-150 ease-out-expo [mask-image:linear-gradient(to_bottom,transparent,black_1.25rem)] ${
          painted || rows.length === 0 ? "opacity-100" : "invisible opacity-0"
        }`}
        // Measurements land in the frame they are taken rather than the next one, so the list
        // settles in fewer frames.
        skipAnimationFrameInResizeObserver
        itemsRendered={(items) => {
          drawnLast.current = items.at(-1)?.data?.key;
        }}
        data={rows}
        firstItemIndex={firstItemIndex}
        // Open on the newest message with its bottom on the floor of the view. A bare index put that
        // row at the top, so the list first laid out from the channel's start and then jumped down.
        initialTopMostItemIndex={{ index: "LAST", align: "end" }}
        // A typical row, so the first pass lays out close to right instead of sizing everything from
        // one probe row (often a short day divider) and correcting over several frames.
        defaultItemHeight={64}
        alignToBottom
        followOutput={(bottom) => (bottom ? "smooth" : false)}
        atBottomStateChange={setAtBottom}
        atBottomThreshold={120}
        startReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        computeItemKey={(_, row) => row.key}
        increaseViewportBy={{ top: 600, bottom: 300 }}
        context={{ hasOlder: !!query.hasNextPage, fetchingOlder: query.isFetchingNextPage, intro }}
        components={LIST_PARTS}
        itemContent={(_, row) => renderRow(row)}
      />
      {/* Only once the list is showing: it reports "not at the bottom" while it is still laying out. */}
      {painted && !atBottom && (
        <button
          type="button"
          onClick={() => list.current?.scrollToIndex({ index: "LAST", behavior: "smooth" })}
          className="surface-card pop-in absolute bottom-4 left-1/2 inline-flex h-10 -translate-x-1/2 items-center gap-2 rounded-full px-4 text-sm font-bold shadow-float"
        >
          <ArrowDown size={15} weight="bold" aria-hidden="true" /> Jump to latest
        </button>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
