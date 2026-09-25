"use client";

import type { Face } from "@nook/contracts";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type CSSProperties, useRef } from "react";
import { faceOf, SHAPES } from "@/lib/faces";
import { gsap, useGSAP } from "@/lib/motion";
import { CLUBS } from "./clubs";
import { type Layout, layCrowd, type Placed } from "./crowd-layout";
import { crowdPhysics } from "./crowd-physics";

gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin);

/*
 * The crowd.
 *
 * The first screen ends in a pile of people: the demo clubs' members and a few dozen others, every
 * one a shape of their own, heaped along the bottom edge in the club's colours. They arrive by
 * jumping up into the room from below it, lean out of the way of the cursor, hop when the page
 * changes clubs (the ones nearest the disc you pressed first), and six of them — the people the
 * next chapter is about — leave the pile as you scroll and land in its who's-here row.
 *
 * Nothing here is a landing-page costume: they are the same shapes and face colours the app draws
 * people with, and they re-tint with the club like everything else on the page. The pile is laid
 * out ahead of time (crowd-layout), so it renders at rest on the server and still stands there
 * with no script, and under reduced motion nothing moves at all.
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
const XL: Layout = layCrowd({
  width: 1440,
  height: HEAP,
  named: named([0.036, 0.103, 0.17, 0.237, 0.304, 0.371], [96, 90, 100, 90, 94, 98]),
  extras: extras([
    88, 76, 84, 64, 80, 58, 70, 86, 56, 74, 62, 82, 54, 66, 58, 78, 52, 60, 68, 50, 46, 44, 40, 48, 42, 38, 46, 36, 44, 40, 48, 38, 42, 36,
    46, 40, 34, 44, 38, 42,
  ]),
  seed: 7,
  ceiling: (x) =>
    x < DEMO_EDGE - 40
      ? Math.max(TRAIL, TRAIL + (HEAP - TRAIL) * (1 - ((x - 280) / 360) ** 2))
      : x < DEMO_EDGE
        ? TRAIL + ((DEMO_EDGE - x) / 40) * 40
        : TRAIL,
});

const MD: Layout = layCrowd({
  width: 1440,
  height: 170,
  named: named([0.07, 0.24, 0.41, 0.58, 0.75, 0.92], [104, 96, 108, 94, 100, 104]),
  extras: extras([92, 78, 86, 66, 82, 60, 72, 88, 56, 76, 64, 84, 54, 68, 58, 80, 54, 62, 70, 50, 56, 52]),
  seed: 7,
});

const NARROW: Layout = layCrowd({
  width: 390,
  height: 112,
  named: named([0.09, 0.26, 0.43, 0.6, 0.76, 0.92], [60, 56, 62, 54, 58, 60]),
  extras: extras([50, 44, 40, 48, 36, 42, 38, 34]),
  seed: 11,
});

const BANDS = [
  { layout: XL, className: "hidden xl:block" },
  { layout: MD, className: "hidden md:block xl:hidden" },
  { layout: NARROW, className: "md:hidden" },
];

/** The band on screen at this width (the others are display: none). */
function visibleBand(root: ParentNode): { band: HTMLElement; layout: Layout } | null {
  const bands = [...root.querySelectorAll<HTMLElement>("[data-crowd-band]")];
  const i = bands.findIndex((b) => b.getClientRects().length > 0);
  return i < 0 ? null : { band: bands[i]!, layout: BANDS[i]!.layout };
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
    // The outer box never moves: it is where this person stands, and what the flight measures from.
    <div data-person={p.key} data-handle={p.handle} data-tilt={p.tilt} className="pointer-events-auto absolute aspect-square" style={style}>
      <div data-flight className="size-full">
        <div data-jump className="size-full origin-bottom">
          <div data-dodge className="size-full">
            <svg viewBox="0 0 40 40" className="block size-full overflow-visible" style={{ rotate: `${p.tilt}deg` }}>
              <path d={SHAPES[p.face.shape]} className="tint" style={{ fill: `var(--face-${p.face.tone})` }} />
              {/* Only the bigger people carry an initial, so the pile reads as a crowd, not an alphabet. */}
              {(p.handle || p.size >= lettered) && (
                <text
                  x="20"
                  y="21"
                  dy="0.35em"
                  textAnchor="middle"
                  fontSize="19"
                  fontWeight={800}
                  className="tint font-display"
                  style={{ fill: `var(--on-face-${p.face.tone})` }}
                >
                  {p.initial}
                </text>
              )}
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

/** A hop: up, down, a squash on landing, and back. `delay` staggers it across the crowd. */
function hop(el: Element, height: number, delay: number) {
  return gsap
    .timeline({ delay })
    .to(el, { y: -height, duration: 0.2 + height / 900, ease: "power2.out" })
    .to(el, { y: 0, duration: 0.18 + height / 1100, ease: "power2.in" })
    .to(el, { scaleY: 0.82, scaleX: 1.12, duration: 0.07, ease: "power1.out" })
    .to(el, { scaleY: 1, scaleX: 1, duration: 0.42, ease: "nook-pop" });
}

export interface HopSignal {
  /** Changes on every club switch. */
  id: number;
  /** Where the switch came from, in client pixels (the disc you pressed), or null for the page's own. */
  x: number | null;
}

export function Crowd({ signal }: { signal: HopSignal }) {
  const root = useRef<HTMLDivElement>(null);
  const lastHop = useRef(signal.id);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add({ ...BAND_QUERIES, motion: MOTION_QUERY }, (ctx) => {
        const { motion } = ctx.conditions as { motion: boolean };
        const shown = visibleBand(root.current!);
        if (!shown) return;
        const { band } = shown;
        if (!motion) {
          root.current!.dataset.landed = "";
          return;
        }
        const people = [...band.querySelectorAll<HTMLElement>("[data-person]")];

        // Arriving: everyone waits below the floor, then jumps up into the room in a loose wave.
        const jumps = people.map((p) => p.querySelector("[data-jump]")!);
        gsap.set(jumps, { y: (i) => band.clientHeight - people[i]!.offsetTop + 8 });
        root.current!.dataset.landed = "";
        const order = gsap.utils.shuffle(jumps.map((_, i) => i));
        order.forEach((i, n) => {
          const el = jumps[i]!;
          const size = people[i]!.offsetWidth;
          gsap
            .timeline({ delay: 0.15 + (n / order.length) * 0.85 })
            .to(el, { y: -size * 0.45, duration: 0.38, ease: "power2.out" })
            .to(el, { y: 0, duration: 0.26, ease: "power2.in" })
            .to(el, { scaleY: 0.8, scaleX: 1.14, duration: 0.07, ease: "power1.out" })
            .to(el, { scaleY: 1, scaleX: 1, duration: 0.45, ease: "nook-pop" });
        });

        // Played with: the cursor nudges people aside, and a fast swipe knocks them flying.
        const section = root.current!.closest("section")!;
        const physics = crowdPhysics(people, "[data-dodge]");
        let lastPointer: { x: number; y: number; t: number } | null = null;
        const onMove = (e: PointerEvent) => {
          if (e.pointerType !== "mouse") return;
          const now = { x: e.clientX, y: e.clientY, t: e.timeStamp };
          if (lastPointer && now.t - lastPointer.t < 120) physics.sweep(lastPointer.x, lastPointer.y, now.x, now.y, now.t - lastPointer.t);
          lastPointer = now;
        };
        const onLeave = () => {
          lastPointer = null;
        };
        section.addEventListener("pointermove", onMove);
        section.addEventListener("pointerleave", onLeave);

        // Tapping someone throws them up to turn a somersault.
        const onTap = (e: Event) => {
          const person = (e.target as Element).closest("[data-person]");
          if (person) physics.tap(person);
        };
        band.addEventListener("click", onTap);

        return () => {
          physics.stop();
          section.removeEventListener("pointermove", onMove);
          section.removeEventListener("pointerleave", onLeave);
          band.removeEventListener("click", onTap);
        };
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  // A club switch: the crowd hops, nearest the disc first. After the render that carried the new
  // club, so the hop starts with the re-tint.
  useGSAP(
    () => {
      if (signal.id === lastHop.current) return;
      lastHop.current = signal.id;
      if (!window.matchMedia(MOTION_QUERY).matches) return;
      const band = visibleBand(root.current!)?.band;
      if (!band) return;
      const bandBox = band.getBoundingClientRect();
      const from = signal.x ?? bandBox.left + bandBox.width / 2;
      for (const p of band.querySelectorAll<HTMLElement>("[data-person]")) {
        const b = p.getBoundingClientRect();
        hop(
          p.querySelector("[data-jump]")!,
          14 + b.width * 0.32,
          (Math.abs(b.left + b.width / 2 - from) / Math.max(bandBox.width, 1)) * 0.45,
        );
      }
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
 * The six fly down: each leaves its spot in the pile as you scroll and lands in its seat in the
 * who's-here row. Both the pile and the row are clipped to their own sections, so a person passing
 * the edge between them changes colour exactly at the threshold, the way everything on a surface
 * takes that surface's colours. Scrubbed, so scrolling back up sends them home.
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
    // Measured from the boxes that never move, so a refresh mid-flight measures the same thing. A
    // seat with a ring draws the shape in 40 of its 54 units; `k` compares the shapes, not the boxes.
    const delta = () => {
      const a = spot.getBoundingClientRect();
      const b = seat.getBoundingClientRect();
      const shape = b.width * (seat.dataset.ring !== undefined ? 40 / 54 : 1);
      return { x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2), k: shape / a.width };
    };
    // They sway on the way down but never turn over (a letter upside down over the chapter's
    // words reads as broken). The two halves always show the same angle: from the lean the person
    // had in the pile, out to a sway of 16° at the half-way mark, and upright on landing. The
    // traveller's drawing already leans by `lean`, so it turns by the angle minus that.
    const lean = Number(spot.dataset.tilt ?? 0);
    const sway = FLYERS.indexOf(handle) % 2 ? -16 : 16;
    const tl = gsap.timeline({
      // Done by the time the row is on screen: from the chapter's top entering to it reaching 45%.
      scrollTrigger: { trigger: row.closest("section"), start: "top 96%", end: "top 45%", scrub: 0.6, invalidateOnRefresh: true },
    });
    tl.fromTo(
      traveller,
      { x: 0, y: 0, scale: 1 },
      { x: () => delta().x, y: () => delta().y, scale: () => delta().k, ease: "none", duration: 1 },
      0,
    );
    tl.fromTo(
      guest,
      { x: () => -delta().x, y: () => -delta().y, scale: () => 1 / delta().k },
      { x: 0, y: 0, scale: 1, ease: "none", duration: 1 },
      0,
    );
    tl.fromTo(traveller, { rotation: 0 }, { rotation: sway, duration: 0.5, ease: "sine.out" }, 0).to(
      traveller,
      { rotation: -lean, duration: 0.5, ease: "sine.in" },
      0.5,
    );
    tl.fromTo(guest, { rotation: lean }, { rotation: lean + sway, duration: 0.5, ease: "sine.out" }, 0).to(
      guest,
      { rotation: 0, duration: 0.5, ease: "sine.in" },
      0.5,
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
