"use client";

import type { Face } from "@nook/contracts";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type CSSProperties, useRef } from "react";
import { faceOf, SHAPES } from "@/lib/faces";
import { gsap, useGSAP } from "@/lib/motion";
import { CLUBS } from "./clubs";
import { type Layout, layCrowd, type Placed } from "./crowd-layout";
import { type CrowdWorld, crowdWorld } from "./crowd-physics";
import { Initial } from "@/components/brand/initial";

gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin);

/*
 * The crowd.
 *
 * The first screen ends in a pile of people: the demo clubs' members and a few dozen others, every
 * one a shape of their own, heaped along the bottom edge in the club's colours. Every visit heaps
 * them differently: the pile is dropped at random, settles as real bodies do (crowd-physics), and
 * then everyone pops up where they came to rest. The cursor shoves them about and a swipe sends
 * them flying, and they stay wherever they land; the page changing clubs makes them all jump (the
 * ones nearest the disc you pressed first); and six of them — the people the next chapter is about —
 * leave the pile as you scroll and land in its who's-here row.
 *
 * Nothing here is a landing-page costume: they are the same shapes and face colours the app draws
 * people with, and they re-tint with the club like everything else on the page. A pile is laid out
 * ahead of time as well (crowd-layout), so the server renders one at rest and it still stands
 * there with no script, and under reduced motion nothing moves at all.
 */

const everyone = CLUBS.flatMap((c) => c.people);
const demo = (handle: string) => everyone.find((p) => p.handle === handle)!;
const initialOf = (name: string) => name.trim()[0]!.toUpperCase();

/** The six the who's-here chapter shows, left to right, in the same order as its row. */
export const FLYERS = ["mara", "lena", "aiko", "priya", "theo", "sam"] as const;

const named = (at: number[], size: number[]) =>
  FLYERS.map((handle, i) => {
    const p = demo(handle);
    return { key: handle, handle, face: faceOf(p), initial: initialOf(p.displayName), at: at[i]!, size: size[i]! };
  });

/** Everyone else: made-up members, mostly in the newer shapes so the pile shows the whole range. */
const EXTRAS: [string, Face][] = [
  ["R", { shape: "star", tone: 1 }],
  ["J", { shape: "hex", tone: 3 }],
  ["N", { shape: "burst", tone: 2 }],
  ["E", { shape: "leaf", tone: 1 }],
  ["K", { shape: "drop", tone: 3 }],
  ["O", { shape: "trefoil", tone: 2 }],
  ["W", { shape: "capsule", tone: 1 }],
  ["B", { shape: "crown", tone: 3 }],
  ["T", { shape: "diamond", tone: 2 }],
  ["F", { shape: "pick", tone: 1 }],
  ["H", { shape: "wave", tone: 3 }],
  ["V", { shape: "bowl", tone: 2 }],
  ["C", { shape: "blob", tone: 1 }],
  ["I", { shape: "clover", tone: 3 }],
  ["G", { shape: "scallop", tone: 2 }],
  ["D", { shape: "squircle", tone: 1 }],
  ["Y", { shape: "arch", tone: 3 }],
  ["U", { shape: "flower", tone: 2 }],
  ["Q", { shape: "star", tone: 3 }],
  ["X", { shape: "pebble", tone: 1 }],
  ["Z", { shape: "burst", tone: 3 }],
  ["P", { shape: "drop", tone: 2 }],
];

const extras = (sizes: number[]) =>
  sizes.map((size, i) => {
    const [initial, face] = EXTRAS[i % EXTRAS.length]!;
    return { key: `x${i}`, initial, face, size };
  });

/*
 * Three piles. From `xl` the hero's left column ends well above its foot, so the crowd heaps up
 * there under the call to action (a mound, highest under the buttons), with the six named people
 * standing in front of it; the live demo floats over the right half of the band, and only small
 * people trail along the floor beneath it, low enough to show whole. Between `md` and `xl`
 * everything stacks, so the pile is one even strip under the demo; phones get a smaller one.
 */
const HEAP = 300;
/** Under the demo only people this small fit, so they show whole below its bottom edge. */
const TRAIL = 52;
/** Where the demo's left edge falls, in band units: the mound ends before it, the trail after. */
const DEMO_EDGE = 620;
/** A pile's recipe: where the six may stand (0–1 across) and how far each may stray, and the rest of it. */
interface PileConfig {
  at: number[];
  jitter: number;
  pile: (at: number[]) => Parameters<typeof layCrowd>[0];
}

const XL_PILE: PileConfig = {
  at: [0.036, 0.103, 0.17, 0.237, 0.304, 0.371],
  jitter: 0.02,
  pile: (at) => ({
    width: 1440,
    height: HEAP,
    named: named(at, [96, 90, 100, 90, 94, 98]),
    extras: extras([
      88, 76, 84, 64, 80, 58, 70, 86, 56, 74, 62, 82, 54, 66, 58, 78, 52, 60, 68, 50, 46, 44, 40, 48, 42, 38, 46, 36, 44, 40, 48, 38, 42,
      36, 46, 40, 34, 44, 38, 42,
    ]),
    seed: 7,
    ceiling: (x) =>
      x < DEMO_EDGE - 40
        ? Math.max(TRAIL, TRAIL + (HEAP - TRAIL) * (1 - ((x - 280) / 360) ** 2))
        : x < DEMO_EDGE
          ? TRAIL + ((DEMO_EDGE - x) / 40) * 40
          : TRAIL,
  }),
};

const MD_PILE: PileConfig = {
  at: [0.07, 0.24, 0.41, 0.58, 0.75, 0.92],
  jitter: 0.03,
  pile: (at) => ({
    width: 1440,
    height: 170,
    named: named(at, [104, 96, 108, 94, 100, 104]),
    extras: extras([92, 78, 86, 66, 82, 60, 72, 88, 56, 76, 64, 84, 54, 68, 58, 80, 54, 62, 70, 50, 56, 52]),
    seed: 7,
  }),
};

const NARROW_PILE: PileConfig = {
  at: [0.09, 0.26, 0.43, 0.6, 0.76, 0.92],
  jitter: 0.03,
  pile: (at) => ({
    width: 390,
    height: 112,
    named: named(at, [60, 56, 62, 54, 58, 60]),
    extras: extras([50, 44, 40, 48, 36, 42, 38, 34]),
    seed: 11,
  }),
};

const BANDS = [
  { config: XL_PILE, layout: layCrowd(XL_PILE.pile(XL_PILE.at)), className: "hidden xl:block" },
  { config: MD_PILE, layout: layCrowd(MD_PILE.pile(MD_PILE.at)), className: "hidden md:block xl:hidden" },
  { config: NARROW_PILE, layout: layCrowd(NARROW_PILE.pile(NARROW_PILE.at)), className: "md:hidden" },
];

/** The band on screen at this width (the others are display: none). */
function visibleBand(root: ParentNode): { band: HTMLElement; layout: Layout; config: PileConfig } | null {
  const bands = [...root.querySelectorAll<HTMLElement>("[data-crowd-band]")];
  const i = bands.findIndex((b) => b.getClientRects().length > 0);
  return i < 0 ? null : { band: bands[i]!, layout: BANDS[i]!.layout, config: BANDS[i]!.config };
}

/** Everyone's physics, by the box they stand in, for the flight to lift them out of it. */
const worlds = new WeakMap<Element, CrowdWorld>();

/** A pile like `layout`, dropped differently: a fresh seed, and the six in a different order along the same stretch. */
function reshuffle(config: PileConfig): Layout {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const at = gsap.utils.shuffle([...config.at]).map((x) => x + (Math.random() - 0.5) * config.jitter);
  return layCrowd({ ...config.pile(at), seed });
}

/** Someone at least this big, next to the named six, gets an initial. */
const INITIAL_AT = 0.72;

function Person({ p, layout, lettered }: { p: Placed; layout: Layout; lettered: number }) {
  const style: CSSProperties = {
    left: `${((p.x - p.size / 2) / layout.width) * 100}%`,
    top: `${((p.y - p.size / 2) / layout.height) * 100}%`,
    width: `${(p.size / layout.width) * 100}%`,
    zIndex: p.z,
  };
  return (
    // The outer box never moves: it is where the server drew this person, and what everything else
    // is measured from. Inside it, the flight carries them to their seat, the physics moves their
    // body, and the arrival pops them up. Only the drawn shape takes the pointer, wherever the
    // physics has put it (the box stays at the server's spot, where someone else may be standing now).
    <div data-person={p.key} data-handle={p.handle} data-tilt={p.tilt} className="absolute aspect-square" style={style}>
      <div data-flight className="size-full">
        <div data-body className="size-full will-change-transform">
          <div data-pop className="size-full origin-bottom">
            <svg viewBox="0 0 40 40" className="block size-full overflow-visible" style={{ rotate: `${p.tilt}deg` }}>
              <path
                d={SHAPES[p.face.shape]}
                className="tint pointer-events-auto cursor-pointer"
                style={{ fill: `var(--face-${p.face.tone})` }}
              />
              {/* Only the bigger people carry an initial, so the pile reads as a crowd, not an alphabet. */}
              {(p.handle || p.size >= lettered) && <Initial char={p.initial} y={21} style={{ fill: `var(--on-face-${p.face.tone})` }} />}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function Band({ layout, className }: { layout: Layout; className: string }) {
  const lettered = Math.max(...layout.people.filter((p) => p.handle).map((p) => p.size)) * INITIAL_AT;
  return (
    <div data-crowd-band className={`relative w-full ${className}`} style={{ aspectRatio: `${layout.width} / ${layout.height}` }}>
      {[...layout.people]
        .sort((a, b) => a.z - b.z)
        .map((p) => (
          <Person key={p.key} p={p} layout={layout} lettered={lettered} />
        ))}
    </div>
  );
}

/** The band changes at these widths, and every animation is set up again for the new one. */
const BAND_QUERIES = { xl: "(min-width: 1280px)", md: "(min-width: 768px) and (max-width: 1279.98px)", narrow: "(max-width: 767.98px)" };
const MOTION_QUERY = "(prefers-reduced-motion: no-preference)";

export interface HopSignal {
  /** Changes on every club switch. */
  id: number;
  /** Where the switch came from, in client pixels (the disc you pressed), or null for the page's own. */
  x: number | null;
}

/** Each person's outline, from their own drawn path: points all the way round it, in its 40×40 box. */
function outlineOf(person: HTMLElement): [number, number][] {
  const path = person.querySelector<SVGPathElement>("svg path:not([data-initial])")!;
  const length = path.getTotalLength();
  return Array.from({ length: 96 }, (_, i) => {
    const at = path.getPointAtLength((i / 96) * length);
    return [at.x, at.y] as [number, number];
  });
}

export function Crowd({ signal }: { signal: HopSignal }) {
  const root = useRef<HTMLDivElement>(null);
  const lastHop = useRef(signal.id);
  const world = useRef<CrowdWorld | null>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add({ ...BAND_QUERIES, motion: MOTION_QUERY }, (ctx) => {
        const { motion } = ctx.conditions as { motion: boolean };
        const shown = visibleBand(root.current!);
        if (!shown) return;
        const { band, layout, config } = shown;
        if (!motion) {
          root.current!.dataset.landed = "";
          return;
        }
        const people = [...band.querySelectorAll<HTMLElement>("[data-person]")];
        const drawn = new Map(layout.people.map((p) => [p.key, p]));
        // This visit's pile: dropped afresh, where the server's one stood.
        const pile = new Map(reshuffle(config).people.map((p) => [p.key, p]));
        let cancelled = false;
        let physics: CrowdWorld | null = null;
        const section = root.current!.closest("section")!;
        const figure = section.querySelector("figure");
        const scale = () => band.clientWidth / layout.width;
        // The room around the pile, in layout units: the top of the hero as a ceiling, the demo as a block.
        const measure = () => {
          if (!physics) return;
          const k = scale();
          const b = band.getBoundingClientRect();
          physics.ceiling((section.getBoundingClientRect().top - b.top) / k);
          const f = figure?.getBoundingClientRect();
          physics.block(f && f.width ? { x: (f.left - b.left) / k, y: (f.top - b.top) / k, w: f.width / k, h: f.height / k } : null);
          physics.draw(k);
        };

        void crowdWorld(
          people.map((el) => {
            const at = drawn.get(el.dataset.person!)!;
            const start = pile.get(el.dataset.person!) ?? at;
            return {
              spot: { x: at.x, y: at.y },
              start: { x: start.x, y: start.y, tilt: start.tilt },
              size: at.size,
              tilt: at.tilt,
              outline: outlineOf(el),
              el: el.querySelector<HTMLElement>("[data-body]")!,
              box: el,
            };
          }),
          layout,
        ).then((made) => {
          if (cancelled) return made.stop();
          physics = made;
          world.current = made;
          for (const el of people) worlds.set(el, made);
          measure();
          // Settled before anyone is seen: the pile comes to rest as real bodies would, then everyone
          // pops up where they came to rest, quickly and in no order.
          made.settle(2.5);
          made.draw(scale());
          const pops = people.map((el) => el.querySelector("[data-pop]")!);
          gsap.set(pops, { scale: 0.2, autoAlpha: 0, y: -18 });
          root.current!.dataset.landed = "";
          gsap.to(pops, {
            scale: 1,
            autoAlpha: 1,
            y: 0,
            duration: 0.34,
            ease: "nook-pop",
            stagger: { each: 0.36 / people.length, from: "random" },
            delay: 0.05,
          });
        });

        const resized = new ResizeObserver(measure);
        resized.observe(band);
        const seen = new IntersectionObserver(([entry]) => physics?.visible(!!entry?.isIntersecting));
        seen.observe(band);

        // Played with: the cursor's path nudges or kicks whoever it crosses; tapping someone throws them up.
        let last: { x: number; y: number; t: number } | null = null;
        const onMove = (e: PointerEvent) => {
          if (e.pointerType === "touch") return;
          const b = band.getBoundingClientRect();
          const k = scale();
          const now = { x: (e.clientX - b.left) / k, y: (e.clientY - b.top) / k, t: e.timeStamp };
          if (last && now.t - last.t < 120) physics?.sweep(last.x, last.y, now.x, now.y, now.t - last.t);
          last = now;
        };
        const onLeave = () => {
          last = null;
        };
        const onTap = (e: Event) => {
          const person = (e.target as Element).closest("[data-person]");
          if (person) physics?.tap(person);
        };
        section.addEventListener("pointermove", onMove);
        section.addEventListener("pointerleave", onLeave);
        band.addEventListener("click", onTap);

        return () => {
          cancelled = true;
          physics?.stop();
          world.current = null;
          resized.disconnect();
          seen.disconnect();
          section.removeEventListener("pointermove", onMove);
          section.removeEventListener("pointerleave", onLeave);
          band.removeEventListener("click", onTap);
        };
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  // A club switch: the crowd jumps, nearest the disc first. After the render that carried the new
  // club, so the jump starts with the re-tint.
  useGSAP(
    () => {
      if (signal.id === lastHop.current) return;
      lastHop.current = signal.id;
      const physics = world.current;
      const shown = visibleBand(root.current!);
      if (!physics || !shown) return;
      const bandBox = shown.band.getBoundingClientRect();
      const k = bandBox.width / shown.layout.width;
      // Where the switch came from, and where everyone is now, in the band's own units.
      const from = ((signal.x ?? bandBox.left + bandBox.width / 2) - bandBox.left) / k;
      const now = physics.positions();
      const sizes = [...shown.band.querySelectorAll<HTMLElement>("[data-person]")].map((p) => p.offsetWidth / k);
      physics.hop(
        (i) => (Math.abs(now[i]!.x - from) / shown.layout.width) * 0.45,
        (i) => 14 / k + sizes[i]! * 0.32,
      );
    },
    { dependencies: [signal.id], scope: root },
  );

  return (
    <div ref={root} aria-hidden="true" className="crowd pointer-events-none relative w-full select-none">
      {BANDS.map((b) => (
        <Band key={b.className} layout={b.layout} className={b.className} />
      ))}
    </div>
  );
}

/**
 * The six fly down: each leaves the pile from wherever it is as you scroll and lands in its seat in
 * the who's-here row. Both the pile and the row are clipped to their own sections, so a person
 * passing the edge between them changes colour exactly at the threshold, the way everything on a
 * surface takes that surface's colours. Scrubbed, so scrolling back up sends them home.
 *
 * The pile has moved since the server drew it, so a flyer is lifted out of the physics the moment
 * the flight starts (held still where it is, the others left standing round it) and the flight
 * sets off from there; back at the top, it is put back in the pile where it was.
 */
export function flyToSeats(scope: HTMLElement) {
  const crowd = scope.querySelector<HTMLElement>(".crowd");
  const band = crowd && visibleBand(crowd)?.band;
  const row = scope.querySelector<HTMLElement>("[data-seats]");
  if (!band || !row) return;
  for (const handle of FLYERS) {
    const spot = band.querySelector<HTMLElement>(`[data-handle="${handle}"]`);
    const seat = row.querySelector<HTMLElement>(`[data-seat="${handle}"]`);
    const traveller = spot?.querySelector<HTMLElement>("[data-flight]");
    const guest = seat?.querySelector<HTMLElement>("[data-seated]");
    if (!spot || !seat || !traveller || !guest) continue;
    // Where the flight sets off from, relative to the spot: where the pile had them, and how they leant.
    const tilt = Number(spot.dataset.tilt ?? 0);
    let from = { x: 0, y: 0, lean: tilt };
    // Measured from the boxes that never move, so a refresh mid-flight measures the same thing. A
    // seat with a ring draws the shape in 40 of its 54 units; `k` compares the shapes, not the boxes.
    const delta = () => {
      const a = spot.getBoundingClientRect();
      const b = seat.getBoundingClientRect();
      const shape = b.width * (seat.dataset.ring !== undefined ? 40 / 54 : 1);
      return { x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2), k: shape / a.width };
    };
    // Someone can come out of the pile lying at any angle, so they right themselves on the way over:
    // one steady turn, the nearer way round, eased in and out across the whole flight (never a stop
    // half-way and a whip round at the end). A sway swings out and back over the top of it, the same
    // way as the turn so nobody sets off the wrong way; it fades for anyone with far to turn.
    const side = FLYERS.indexOf(handle) % 2 ? -1 : 1;
    const turned = (p: number) => {
      const lean = from.lean;
      const way = Math.abs(lean) > 1 ? -Math.sign(lean) : side;
      const sway = 16 * way * Math.max(0, 1 - Math.abs(lean) / 60);
      return (-lean * (1 - Math.cos(Math.PI * p))) / 2 + sway * Math.sin(Math.PI * p);
    };
    let lifted = false;
    const tl = gsap.timeline({
      // Done by the time the row is on screen: from the chapter's top entering to it reaching 45%.
      scrollTrigger: { trigger: row.closest("section"), start: "top 96%", end: "top 45%", scrub: 0.6, invalidateOnRefresh: true },
      onUpdate() {
        const world = worlds.get(spot);
        if (!world) return;
        if (!lifted && tl.progress() > 0) {
          const at = world.lift(spot);
          if (!at) return;
          lifted = true;
          // The physics keeps count of every turn someone has tumbled through (720° is upright
          // too); the flight only undoes what shows, the nearer way round, so nobody spins down.
          const shown = (((((at.angle * 180) / Math.PI) % 360) + 540) % 360) - 180;
          from = { x: at.x, y: at.y, lean: shown };
          tl.invalidate();
        } else if (lifted && tl.progress() === 0) {
          lifted = false;
          from = { x: 0, y: 0, lean: tilt };
          gsap.set(traveller, { x: 0, y: 0, rotation: 0, scale: 1 });
          world.drop(spot);
          tl.invalidate();
        }
      },
    });
    tl.fromTo(
      traveller,
      { x: () => from.x, y: () => from.y, scale: 1 },
      { x: () => delta().x, y: () => delta().y, scale: () => delta().k, ease: "none", duration: 1 },
      0,
    );
    tl.fromTo(
      guest,
      { x: () => from.x - delta().x, y: () => from.y - delta().y, scale: () => 1 / delta().k },
      { x: 0, y: 0, scale: 1, ease: "none", duration: 1 },
      0,
    );
    // The traveller's drawing already leans by `from.lean` (the physics turned it), so it turns by
    // the angle minus that; the guest in the seat shows the whole angle, upright on landing.
    const flight = { p: 0 };
    tl.fromTo(
      flight,
      { p: 0 },
      {
        p: 1,
        duration: 1,
        ease: "none",
        onUpdate() {
          const r = turned(flight.p);
          gsap.set(traveller, { rotation: r });
          gsap.set(guest, { rotation: from.lean + r });
        },
      },
      0,
    );
    // Landing: whoever is here draws their ring on, and the name and state come up under them.
    const ring = guest.querySelector("path[fill='none']");
    if (ring) tl.fromTo(ring, { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.25, ease: "none" }, 0.78);
    const labels = seat.closest("li")?.querySelectorAll("[data-seat-label]");
    if (labels?.length) {
      // Set both labels' start up front: a staggered tween only renders the first one's until it starts.
      gsap.set(labels, { autoAlpha: 0, y: 8 });
      tl.to(labels, { autoAlpha: 1, y: 0, duration: 0.2, stagger: 0.04, ease: "none" }, 0.8);
    }
  }
}
