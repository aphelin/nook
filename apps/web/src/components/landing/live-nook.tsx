"use client";

import { ArrowUp, Hash, Pause, Play } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useMemo, useState } from "react";
import { NookDisc } from "@/components/brand/nook-disc";
import { StatusEmoji } from "@/components/people/person-card";
import { Avatar } from "@/components/ui/avatar";
import { formatMessage, type ResolveMention } from "@/lib/format";
import { countLabel } from "@/lib/unread";
import { CLUBS, type DemoClub, type DemoLine } from "./clubs";

export const STEP_MS = 2600;
const TYPING_MS = 1100;
export const REST_MS = 5000;
/** The demo is seen through Mara's eyes: mentions of her get the "you" chip. */
const VIEWER = "mara";

/** Fixed, made-up clock times, so the server and the browser render the same thing. */
const timeFor = (i: number) => `7:${String(4 + i * 3).padStart(2, "0")} PM`;

/**
 * Who reacted, derived from the club's own people so the demo shows the real signature rather
 * than a bare count. Deterministic from the emoji, so the server and the browser agree.
 */
function reactors(club: DemoClub, emoji: string, count: number) {
  const offset = [...emoji].reduce((n, ch) => n + ch.codePointAt(0)!, 0) % club.people.length;
  return Array.from({ length: Math.min(count, 3) }, (_, i) => club.people[(offset + i) % club.people.length]!);
}

function DemoMessage({ line, club, index, fresh }: { line: DemoLine; club: DemoClub; index: number; fresh: boolean }) {
  const author = club.people.find((p) => p.handle === line.who)!;
  const resolve: ResolveMention = (handle) => {
    const p = club.people.find((x) => x.handle === handle);
    return p ? { id: p.id, name: p.displayName, isMe: p.handle === VIEWER } : null;
  };
  return (
    <li className={`grid w-full grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2.5 px-3.5 pt-3 ${fresh ? "motion-safe:arrive" : ""}`}>
      <Avatar user={author} size={36} />
      <div className="flex min-w-0 flex-col items-start">
        <p className="flex items-baseline gap-1.5 text-sm">
          <span className="truncate font-extrabold">{author.displayName}</span>
          <StatusEmoji user={author} />
          <span className="text-xs font-medium text-fg-2" data-num>
            {timeFor(index)}
          </span>
        </p>
        <p className="text-sm leading-snug break-words">{formatMessage(line.body, resolve)}</p>
        {line.reactions && (
          <p className="relative mt-1.5 flex gap-1.5">
            {Object.entries(line.reactions).map(([emoji, n]) => (
              <span key={emoji} className="surface-card inline-flex h-7 items-center gap-1.5 rounded-full pr-2 pl-1.5 text-xs font-bold">
                <span aria-hidden="true" className="text-sm leading-none">
                  {emoji}
                </span>
                <span aria-hidden="true" className="flex -space-x-1">
                  {reactors(club, emoji, n).map((p) => (
                    <Avatar key={p.id} user={p} size={16} />
                  ))}
                </span>
                <span className="sr-only">{n} reacted</span>
              </span>
            ))}
          </p>
        )}
      </div>
    </li>
  );
}

interface LiveNookProps {
  club: DemoClub;
  playing: boolean;
  /** Called once the script has played and rested, in place of starting it over. */
  onFinished?: () => void;
}

/**
 * A nook running on the landing page, drawn with the app's own pieces and surfaces: the rail of
 * club discs, the wing in the club's deep colour, the room drenched in its bright one, people as
 * shapes, mention chips and reaction pills that carry who reacted. The conversation is scripted
 * and fictional; it plays, rests, and then either starts over or hands over to whoever is
 * listening for the end of it.
 */
export function LiveNook({ club, playing, onFinished }: LiveNookProps) {
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState<string | null>(null);

  // Each club starts from its opening lines.
  const [forClub, setForClub] = useState(club.id);
  if (forClub !== club.id) {
    setForClub(club.id);
    setShown(0);
    setTyping(null);
  }

  useEffect(() => {
    if (!playing) return;
    if (shown >= club.script.length) {
      const rest = setTimeout(() => (onFinished ? onFinished() : setShown(0)), REST_MS);
      return () => clearTimeout(rest);
    }
    const next = club.script[shown]!;
    const startTyping = setTimeout(() => setTyping(next.who), STEP_MS - TYPING_MS);
    const arrive = setTimeout(() => {
      setTyping(null);
      setShown((n) => n + 1);
    }, STEP_MS);
    return () => {
      clearTimeout(startTyping);
      clearTimeout(arrive);
    };
  }, [playing, shown, club, onFinished]);

  const lines = useMemo(() => [...club.opening, ...club.script.slice(0, shown)], [club, shown]);
  const typist = typing ? club.people.find((p) => p.handle === typing) : null;
  // The busiest other channel keeps collecting unread messages while you watch.
  const channels = club.channels.map((c, i) => (i === 0 ? { ...c, unread: c.unread + Math.floor(shown / 2) } : c));
  const here = club.people.filter((p) => p.presence !== "offline");

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[1.5rem] md:grid-cols-[3.75rem_12rem_minmax(0,1fr)]">
      {/* The rail */}
      <div aria-hidden="true" className="surface-rail tint hidden flex-col items-center gap-2.5 pt-4 md:flex">
        {CLUBS.map((c) => (
          <span key={c.id} className={`rounded-full ${c.id === club.id ? "p-[2px] ring-2 ring-fg ring-inset" : "p-[4px]"}`}>
            <NookDisc kit={c.kit} initial={c.name[0]} size={34} />
          </span>
        ))}
      </div>

      {/* The wing */}
      <div className="surface-wing tint hidden min-h-0 flex-col md:flex">
        <p className="line-clamp-2 px-4 pt-5 font-display text-xl leading-[0.95] font-extrabold tracking-[-0.02em]">{club.name}</p>
        <ul className="mt-4 flex flex-col gap-0.5 px-2" aria-label="Channels">
          <li className="tint flex h-9 items-center gap-2 rounded-full bg-hi px-3 text-sm font-extrabold text-on-hi">
            <Hash size={14} weight="bold" aria-hidden="true" />
            <span className="truncate">{club.channel}</span>
          </li>
          {channels.map((c) => (
            <li
              key={c.name}
              className={`flex h-9 items-center gap-2 rounded-full px-3 text-sm ${c.unread ? "font-extrabold text-fg" : "font-medium text-fg-2"}`}
            >
              <Hash size={14} weight="bold" aria-hidden="true" className="opacity-80" />
              <span className="truncate">{c.name}</span>
              <span className="sr-only">{c.unread ? `, ${c.unread} unread` : ""}</span>
              {!!c.mentions && (
                <span
                  aria-hidden="true"
                  data-num
                  className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-pop px-1.5 text-2xs leading-none font-extrabold text-on-pop"
                >
                  {countLabel(c.mentions)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* The room, headed on phones by a band of the wing, so the demo stays a card on a page of its own colour. */}
      <div className="surface-stage tint flex min-h-0 flex-col">
        <div aria-hidden="true" className="surface-wing tint flex shrink-0 items-center gap-2.5 px-4 py-3 md:hidden">
          <NookDisc kit={club.kit} initial={club.name[0]} size={30} />
          <span className="min-w-0 flex-1 truncate font-display text-lg leading-none font-extrabold tracking-[-0.02em]">{club.name}</span>
          <span className="tint inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-hi px-3 text-sm font-extrabold text-on-hi">
            <Hash size={13} weight="bold" />
            {club.channel}
          </span>
        </div>
        <div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-4">
          <div className="min-w-0">
            <p className="truncate font-display text-3xl leading-none font-extrabold tracking-[-0.04em]">{club.channel}</p>
            <p className="mt-2 text-xs font-bold" data-num>
              {club.people.length + 11} members, {here.length} here
            </p>
          </div>
          <ul aria-label="Who's here" className="hidden shrink-0 -space-x-1.5 sm:flex">
            {here.map((p) => (
              <li key={p.id}>
                <Avatar user={p} size={34} ring />
              </li>
            ))}
          </ul>
        </div>
        {/*
          Newest at the bottom, stacked upwards. A message that doesn't fully fit wraps into a second
          column that overflow hides, so only whole messages ever show, at any size of the sheet.
        */}
        <ol
          aria-label={`Messages in #${club.channel}`}
          className="flex min-h-0 flex-1 flex-col-reverse flex-wrap content-start overflow-hidden pb-2"
        >
          {lines
            .map((line, i) => <DemoMessage key={`${club.id}-${i}`} line={line} club={club} index={i} fresh={i >= club.opening.length} />)
            .reverse()}
        </ol>
        <p aria-hidden="true" className="h-5 shrink-0 px-4 text-xs font-semibold text-fg-2">
          {typist ? `${typist.displayName.split(" ")[0]} is typing…` : ""}
        </p>
        <div
          aria-hidden="true"
          className="surface-card tint mx-3 mb-3 flex h-12 shrink-0 items-center gap-2 rounded-full pr-1.5 pl-5 shadow-card"
        >
          <span className="min-w-0 flex-1 truncate text-sm text-fg-2">Message #{club.channel}</span>
          <span className="tint grid size-9 shrink-0 place-items-center rounded-full bg-hi text-on-hi">
            <ArrowUp size={17} weight="bold" aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  );
}

/** Pauses and resumes the live demo: anything that updates by itself for this long needs a stop. */
export function PauseButton({ playing, onToggle }: { playing: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-hover px-4 text-sm font-bold whitespace-nowrap transition-colors duration-150 hover:bg-hover-strong"
    >
      {playing ? <Pause size={15} weight="fill" aria-hidden="true" /> : <Play size={15} weight="fill" aria-hidden="true" />}
      {playing ? "Pause demo" : "Play demo"}
    </button>
  );
}
