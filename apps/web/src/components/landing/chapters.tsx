"use client";

import type { Attachment, PresenceState } from "@nook/contracts";
import { CaretRight, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type ReactNode, useRef } from "react";
import { Attachments } from "@/components/chat/attachments";
import { LinkPreviews } from "@/components/chat/link-preview";
import { Avatar } from "@/components/ui/avatar";
import { PRESENCE_LABEL, PresenceShape } from "@/components/ui/presence-shape";
import { accentStyle } from "@/lib/accent";
import { formatMessage, type ResolveMention } from "@/lib/format";
import { gsap, useGSAP } from "@/lib/motion";
import { highlight } from "@/lib/search";
import { CLUBS, type DemoPerson } from "./clubs";

gsap.registerPlugin(ScrollTrigger);

/*
 * What's inside, as a run of stories.
 *
 * Each chapter is one full-width card of colour with one thing Nook does, said loud and then shown
 * with the app's own pieces and made-up people. Every chapter wears a different demo club's kit,
 * so scrolling the page is also a tour of how the same app looks in four clubs' colours.
 */

const everyone = CLUBS.flatMap((c) => c.people);
const person = (handle: string) => everyone.find((p) => p.handle === handle)!;
/** The page is seen through Mara's eyes: mentions of her get the "you" chip, her reaction is hers. */
const VIEWER = "mara";
const resolve: ResolveMention = (handle) => {
  const p = everyone.find((x) => x.handle === handle);
  return p ? { id: p.id, name: p.displayName, isMe: p.handle === VIEWER } : null;
};

const TOPO: Attachment = {
  id: "00000000-0000-7000-8000-000000000005",
  fileName: "fontainebleau-topo.pdf",
  mimeType: "application/pdf",
  size: 2_400_000,
  status: "ready",
  url: "https://example.com/fontainebleau-topo.pdf",
  thumbUrl: null,
  width: null,
  height: null,
};

const CRASH_PADS = {
  url: "https://example.com/crash-pads",
  siteName: "example.com",
  title: "Crash pads, half price until Sunday",
  description: "A made-up gear shop, unfurled by Nook’s background worker.",
  imageUrl: null,
};

const REPLIES = [
  { who: "jonas", time: "7:41 PM", body: "In. Two pads and we can finally do the cave problems" },
  { who: "sam", time: "7:43 PM", body: "I’ll chip in if noodles are after" },
  { who: "mara", time: "7:45 PM", body: "Grabbing them Thursday. @theo pay me back whenever" },
];

const RESULTS = [
  { who: "theo", where: "#general", when: "7:10 PM", body: "Anyone want to split a new crash pad? Ours is basically a yoga mat now" },
  { who: "sam", where: "#trip-planning", when: "Aug 28", body: "Bring both crash pads to Font, the landings are rough" },
  { who: "mara", where: "#gear-swap", when: "Jun 3", body: "Old crash pad going free, one careful owner" },
];

/**
 * One chapter: a band of a club's colour, its headline, a line of copy, and the thing itself — side
 * by side (flipped every other time), or stacked, with the thing at full width under the words.
 */
function Chapter({
  club,
  surface,
  title,
  body,
  flip = false,
  stack = false,
  children,
}: {
  club: number;
  surface: "stage" | "wing" | "card";
  title: string;
  body: string;
  flip?: boolean;
  stack?: boolean;
  children: ReactNode;
}) {
  const id = `chapter-${title.split(" ")[0]!.toLowerCase()}`;
  const head = (
    <h2
      id={id}
      className="font-display text-[clamp(2.5rem,5vw,4.5rem)] leading-[0.92] font-extrabold tracking-[-0.04em] text-balance text-title"
    >
      {title}
    </h2>
  );
  if (stack) {
    return (
      <section style={accentStyle(CLUBS[club]!.kit)} aria-labelledby={id} className={`surface-${surface} relative isolate overflow-hidden`}>
        <div className="mx-auto max-w-[90rem] px-5 py-20 sm:px-8 md:py-28 xl:px-12">
          {/* Above whatever flies in beneath it: the who's-here six pass behind the words, not over them. */}
          <div className="relative z-10 grid items-end gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-20">
            {head}
            <p className="max-w-[40ch] text-xl text-pretty">{body}</p>
          </div>
          <div className="mt-14 md:mt-20">{children}</div>
        </div>
      </section>
    );
  }
  return (
    <section style={accentStyle(CLUBS[club]!.kit)} aria-labelledby={id} className={`surface-${surface} relative isolate overflow-hidden`}>
      <div
        className={`mx-auto grid max-w-[90rem] items-center gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20 xl:px-12 ${
          flip ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" : ""
        }`}
      >
        <div className={flip ? "lg:order-2" : ""}>
          {head}
          <p className="mt-6 max-w-[40ch] text-xl text-pretty">{body}</p>
        </div>
        <div className={`min-w-0 ${flip ? "lg:order-1" : ""}`}>{children}</div>
      </div>
    </section>
  );
}

function Name({ who }: { who: DemoPerson }) {
  return <span className="font-extrabold">{who.displayName}</span>;
}

/** A message the way the room draws it: the author's shape, their name, the words on the colour. */
function Said({
  who,
  time,
  body,
  big = false,
  children,
}: {
  who: string;
  time: string;
  body: string;
  big?: boolean;
  children?: ReactNode;
}) {
  const p = person(who);
  return (
    <div
      data-arrive="said"
      className={`grid gap-x-3.5 ${big ? "grid-cols-[4.5rem_minmax(0,1fr)] gap-x-5" : "grid-cols-[3rem_minmax(0,1fr)]"}`}
    >
      <Avatar user={p} size={big ? 72 : 48} />
      <div className="min-w-0">
        <p className={`flex items-baseline gap-2 ${big ? "text-xl" : "text-md"}`}>
          <Name who={p} />
          <span className="text-sm font-semibold text-fg-2">{time}</span>
        </p>
        <p className={`mt-0.5 leading-snug text-pretty ${big ? "text-3xl font-semibold tracking-[-0.01em]" : "text-lg"}`}>
          {formatMessage(body, resolve)}
        </p>
        {children}
      </div>
    </div>
  );
}

const ROOM: [string, PresenceState][] = [
  ["mara", "online"],
  ["lena", "dnd"],
  ["aiko", "online"],
  ["priya", "away"],
  ["theo", "online"],
  ["sam", "offline"],
];

/** A message landing, the way the app's own `arrive` does: from a little below, a touch small. */
const ARRIVE = { y: 16, scale: 0.96, autoAlpha: 0, duration: 0.42, ease: "nook-pop", transformOrigin: "0% 100%" };
/** A chip, a face or a count: slapped down from 40%. */
const POP = { scale: 0.4, autoAlpha: 0, duration: 0.38, ease: "nook-pop" };

/**
 * Each chapter's piece plays out the way it would in the app, once, as it comes on screen: the
 * message lands and the reactions pop onto it, thread replies arrive one after another, the file
 * drops in and the link unfolds, the search types itself and its hits light up. No heading or
 * paragraph moves, and under reduced motion none of it runs: everything is simply there.
 */
function useStories(root: React.RefObject<HTMLDivElement | null>) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const story = (name: string, build: (el: HTMLElement, tl: gsap.core.Timeline) => void) => {
          const el = root.current!.querySelector<HTMLElement>(`[data-story="${name}"]`);
          if (el) build(el, gsap.timeline({ scrollTrigger: { trigger: el, start: "top 78%", once: true } }));
        };
        const all = (el: HTMLElement, what: string) => [...el.querySelectorAll<HTMLElement>(`[data-arrive="${what}"]`)];

        story("reactions", (el, tl) => {
          tl.from(all(el, "said"), ARRIVE)
            .from(all(el, "chip"), { ...POP, stagger: 0.14 }, "-=0.08")
            .from(all(el, "face"), { ...POP, stagger: 0.06 }, "<0.08")
            .from(all(el, "pill"), { x: -18, autoAlpha: 0, duration: 0.45, ease: "nook" }, "-=0.12");
        });

        story("thread", (el, tl) => {
          tl.from(el, { y: 40, autoAlpha: 0, duration: 0.6, ease: "nook" }).from(all(el, "said"), { ...ARRIVE, stagger: 0.38 }, "-=0.25");
        });

        story("files", (el, tl) => {
          const [first, second] = all(el, "said");
          tl.from(first!, ARRIVE)
            .from(all(el, "file"), { y: -10, scale: 0.94, autoAlpha: 0, duration: 0.4, ease: "nook-pop" }, "-=0.1")
            .from(second!, ARRIVE, "+=0.2")
            .fromTo(
              all(el, "unfold"),
              { clipPath: "inset(0% 0% 100% 0% round 16px)" },
              { clipPath: "inset(0% 0% 0% 0% round 16px)", duration: 0.55, ease: "nook", clearProps: "clipPath" },
              "-=0.1",
            );
        });

        story("search", (el, tl) => {
          const typed = el.querySelector<HTMLElement>("[data-typed]")!;
          const steps = typed.dataset.typed!.length;
          const marks = [...el.querySelectorAll<HTMLElement>("mark")];
          tl.from(el, { y: 30, autoAlpha: 0, duration: 0.5, ease: "nook" })
            // Typed, a letter's width at a time.
            .fromTo(
              typed,
              { clipPath: "inset(0% 100% 0% 0%)" },
              { clipPath: "inset(0% 0% 0% 0%)", duration: steps * 0.07, ease: `steps(${steps})`, clearProps: "clipPath" },
            )
            .from(all(el, "result"), { y: 10, autoAlpha: 0, duration: 0.4, ease: "nook", stagger: 0.12 }, "+=0.1")
            // The matched words light up: from plain text into the highlight.
            .from(
              marks,
              {
                backgroundColor: "rgba(0,0,0,0)",
                color: (_: number, m: HTMLElement) => getComputedStyle(m.parentElement!).color,
                duration: 0.35,
                ease: "nook",
                stagger: 0.07,
                clearProps: "backgroundColor,color",
              },
              "-=0.1",
            );
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );
}

export function Chapters() {
  const root = useRef<HTMLDivElement>(null);
  useStories(root);
  return (
    <div ref={root}>
      <Chapter
        club={0}
        surface="wing"
        stack
        title="Who’s here, before anyone says a word."
        body="Everyone is a shape of their own, and whoever is around wears a ring. Four presence states you can tell apart without colour."
      >
        <ul aria-label="Who's here" data-seats className="grid grid-cols-3 gap-x-4 gap-y-10 sm:grid-cols-6">
          {ROOM.map(([handle, state]) => {
            const p = person(handle);
            return (
              <li key={handle} className="flex flex-col items-center gap-4">
                {/* The seat stays put; the person in it is who flies down from the crowd above. */}
                <span data-seat={handle} data-ring={state === "online" ? "" : undefined} className="block w-full max-w-[10.5rem]">
                  <span data-seated className="block">
                    <Avatar user={p} size={168} ring={state === "online"} className="h-auto w-full" />
                  </span>
                </span>
                <span data-seat-label className="flex items-center gap-2 text-lg font-extrabold">
                  <PresenceShape state={state} size={16} />
                  {p.displayName.split(" ")[0]}
                </span>
                <span data-seat-label className="-mt-3 text-sm font-semibold text-fg-2">
                  {PRESENCE_LABEL[state]}
                </span>
              </li>
            );
          })}
        </ul>
      </Chapter>

      <Chapter
        club={1}
        surface="stage"
        flip
        title="See who agreed, not just how many."
        body="Reactions sit under the message carrying the shapes of the people behind them, so who’s in on something is on screen instead of behind a hover."
      >
        <div data-story="reactions" className="max-w-[44rem]">
          <Said big who="theo" time="7:10 PM" body="Anyone want to split a new crash pad? Ours is basically a yoga mat now">
            <div className="mt-4 flex flex-wrap gap-2.5">
              {[
                { emoji: "🙌", who: ["jonas", "sam", "aiko"] },
                { emoji: "🧗", who: ["mara"] },
              ].map((r) => {
                const mine = r.who.includes(VIEWER);
                return (
                  <span
                    key={r.emoji}
                    data-arrive="chip"
                    className={`inline-flex h-14 items-center gap-2.5 rounded-full pr-5 pl-3.5 text-lg ${
                      mine
                        ? "bg-hi font-extrabold text-on-hi [--face-1:var(--on-hi)] [--face-2:var(--on-hi)] [--face-3:var(--on-hi)] [--on-face-1:var(--hi)] [--on-face-2:var(--hi)] [--on-face-3:var(--hi)]"
                        : "surface-card font-bold"
                    }`}
                  >
                    <span aria-hidden="true" className="text-2xl leading-none">
                      {r.emoji}
                    </span>
                    <span className="flex -space-x-2">
                      {r.who.map((h) => (
                        <span key={h} data-arrive="face" className="inline-flex">
                          <Avatar user={person(h)} size={34} />
                        </span>
                      ))}
                    </span>
                    <span className="sr-only">
                      {r.who.map((h) => person(h).displayName.split(" ")[0]).join(", ")} reacted with {r.emoji}
                    </span>
                  </span>
                );
              })}
            </div>
            <span
              data-arrive="pill"
              className="mt-4 inline-flex max-w-full items-center gap-2.5 rounded-full bg-hover py-2 pr-4 pl-2.5 text-base sm:text-lg"
            >
              <span className="flex -space-x-1.5">
                {["jonas", "sam", "mara"].map((h) => (
                  <Avatar key={h} user={person(h)} size={34} />
                ))}
              </span>
              <span className="font-extrabold whitespace-nowrap">3 replies</span>
              {/* One line on a phone too: there the count says enough, and the time joins it where there is room. */}
              <span className="font-semibold whitespace-nowrap text-fg-2 max-sm:hidden">Last reply 7:45 PM</span>
              <CaretRight size={13} weight="bold" aria-hidden="true" />
            </span>
          </Said>
        </div>
      </Chapter>

      <Chapter
        club={2}
        surface="stage"
        title="Side quests go in threads."
        body="One level of replies keeps the plan for Saturday out of the main room. Channels public or private, and direct messages for everything else."
      >
        {/* The wrapper moves, not the card: the card's re-tint transitions opacity and transform itself. */}
        <div data-story="thread" className="max-w-[38rem]">
          <div className="surface-card tint rounded-card p-6 shadow-float sm:p-8">
            <p className="font-display text-3xl leading-none font-extrabold tracking-[-0.03em]">Thread</p>
            <p className="mt-2 text-sm font-bold text-fg-2">#general in Patch Bay</p>
            <div className="mt-6 flex flex-col gap-5">
              {REPLIES.map((r) => (
                <Said key={r.time} who={r.who} time={r.time} body={r.body} />
              ))}
            </div>
          </div>
        </div>
      </Chapter>

      <Chapter
        club={3}
        surface="wing"
        flip
        title="Drop in the topo, the photos, the link."
        body="Files go straight into the conversation. Images keep their real proportions with thumbnails made in the background, and links unfold into cards."
      >
        <div data-story="files" className="max-w-[40rem]">
          <Said who="mara" time="8:20 PM" body="Topo for Saturday. @jonas you’re on the cave problems">
            <div data-arrive="file">
              <Attachments items={[TOPO]} />
            </div>
          </Said>
          <div className="mt-6">
            <Said who="jonas" time="8:24 PM" body="And the pads are half price until Sunday">
              <div data-arrive="unfold">
                <LinkPreviews items={[CRASH_PADS]} />
              </div>
            </Said>
          </div>
        </div>
      </Chapter>

      <Chapter
        club={0}
        surface="stage"
        title="Find anything, however old."
        body="Search every message as you type, narrowed with in:#channel and from:@name, and jump to it. Ctrl+K opens everything from anywhere."
      >
        <div data-story="search" className="surface-card max-w-[38rem] overflow-hidden rounded-card shadow-float">
          <div className="m-3 flex h-14 items-center gap-3 rounded-full bg-chip px-5 text-on-chip">
            <MagnifyingGlass size={21} weight="bold" aria-hidden="true" />
            <span data-typed="crash pad" className="text-lg font-medium">
              crash pad
            </span>
          </div>
          <ol aria-label="Search results" className="flex flex-col gap-1 px-3 pb-3">
            {RESULTS.map((r, i) => {
              const p = person(r.who);
              return (
                <li
                  key={r.when}
                  data-arrive="result"
                  className={`grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 rounded-[1.25rem] px-3 py-3 ${i === 0 ? "bg-chip" : ""}`}
                >
                  <Avatar user={p} size={36} />
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-2 text-sm text-fg-2">
                      <span className="truncate font-extrabold text-fg">{p.displayName}</span>
                      <span className="truncate font-semibold">{r.where}</span>
                      <span className="ml-auto shrink-0 font-semibold">{r.when}</span>
                    </span>
                    <span className="mt-1 block text-base leading-snug">{highlight(r.body, ["crash", "pad"])}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </Chapter>
    </div>
  );
}
