"use client";

import type { Kit } from "@nook/contracts";
import { paintStyle } from "@/lib/accent";
import { reducedMotion } from "@/lib/motion";
import { type Liquid, liquidPaint } from "./liquid";
import { layerFrames, type PourPlan, pourPlan, revealFrames } from "./paint";

/*
 * The story turn: changing clubs, the new club's colour is poured over the screen. The browser
 * snapshots the room you are leaving and the new club is drawn; then a wave of the new club's paint
 * comes down from the top-left corner, dripping, and the new room fills in behind it until it has
 * run off the bottom-right one (the pour is planned in ./paint).
 *
 * The paint is liquid (./liquid, drawn on the GPU every frame, in a worker, from the room's own
 * clock) on a canvas with a view-transition name of its own, so it sits over both screens and is not
 * cut by the new room's clip; the new room is uncovered by a clip the browser runs on the compositor.
 * Neither waits for the main thread, so the new room's own work cannot make the pour stutter. Without WebGL it falls back to
 * three clip-path layers inside the new screen. Either way it is taken away once the room has
 * covered it. While it runs the usual re-tint is off, so the room arrives already in its club's
 * colours. With no View Transitions in the browser, or under reduced motion, the change is made.
 */

type Transitioning = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => { ready: Promise<void>; finished: Promise<void> };
};

/** How long the pour takes, from the first drop to the room covering the last corner. */
export const POUR_MS = 820;

/** Dispatched on window with a moment of the pour (0 to 1): the paint is drawn there and held. */
export const POUR_HOLD = "nook:pour-hold";

let pours = 0;

/*
 * The new room is captured as soon as it is drawn, but some of its first work (scrolling the
 * conversation to its end, measuring it, the effects that follow) the browser only lets run once
 * the transition's frames resume. The paint waits for that to pass, holding the screen you are
 * leaving, so it pours with the main thread quiet: two frames and then idle, and never longer than
 * `SETTLE_MS`.
 */
const SETTLE_MS = 180;
const settled = () =>
  new Promise<void>((resolve) => {
    const cap = window.setTimeout(resolve, SETTLE_MS);
    const done = () => {
      window.clearTimeout(cap);
      resolve();
    };
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if ("requestIdleCallback" in window) window.requestIdleCallback(done, { timeout: SETTLE_MS - 60 });
        else done();
      }),
    );
  });

const fixed = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";

/** The liquid paint over both screens, or, where WebGL cannot be had, three layers inside the new one. */
function layPaint(plan: PourPlan, colours: ReturnType<typeof paintStyle>): { coat: HTMLElement; liquid: Liquid | null } {
  const canvas = document.createElement("canvas");
  canvas.dataset.paint = "liquid";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = `${fixed};width:100vw;height:100vh;view-transition-name:nook-paint`;
  document.body.append(canvas);
  const liquid = liquidPaint(canvas, plan, colours);
  if (liquid) return { coat: canvas, liquid };
  canvas.remove();
  const frames = layerFrames(plan);
  const coat = document.createElement("div");
  coat.dataset.paint = "layers";
  coat.setAttribute("aria-hidden", "true");
  coat.style.cssText = `${fixed};contain:strict`;
  for (const [name, colour] of [
    ["paint", colours.paint],
    ["gloss", colours.gloss],
    ["rim", colours.rim],
  ] as const) {
    const layer = document.createElement("div");
    layer.dataset.layer = name;
    layer.style.cssText = `position:absolute;inset:0;background-color:${colour};clip-path:${frames[name][0]}`;
    coat.append(layer);
  }
  document.body.append(coat);
  return { coat, liquid: null };
}

/** Changes clubs under a pour of `kit`'s colour. Resolves once the new room is wholly on screen. */
export async function turn(kit: Kit, update: () => Promise<void> | void): Promise<void> {
  const doc = document as Transitioning;
  if (!doc.startViewTransition || reducedMotion()) {
    await update();
    return;
  }
  const root = document.documentElement;
  const id = String((pours += 1));
  const plan = pourPlan(window.innerWidth, window.innerHeight);
  const colours = paintStyle(kit);
  let laid: { coat: HTMLElement; liquid: Liquid | null } | null = null;
  root.dataset.turn = id;
  try {
    const transition = doc.startViewTransition(async () => {
      await update();
      laid = layPaint(plan, colours);
    });
    await transition.ready;
    const paint = laid as { coat: HTMLElement; liquid: Liquid | null } | null;
    const timing: KeyframeAnimationOptions = { duration: POUR_MS, easing: "linear", fill: "both" };
    const newRoom = "::view-transition-new(root)";
    const runs: (Animation | undefined)[] = [];
    if (paint?.liquid) {
      runs.push(
        root.animate(
          revealFrames(plan).map((clipPath) => ({ clipPath })),
          { ...timing, pseudoElement: newRoom },
        ),
      );
    } else {
      const frames = layerFrames(plan);
      const layer = (name: string) => paint?.coat.querySelector<HTMLElement>(`[data-layer="${name}"]`);
      runs.push(
        root.animate(
          frames.front.map((clipPath) => ({ clipPath })),
          { ...timing, pseudoElement: newRoom },
        ),
        layer("paint")?.animate(
          frames.paint.map((clipPath) => ({ clipPath })),
          timing,
        ),
        layer("gloss")?.animate(
          frames.gloss.map((clipPath) => ({ clipPath })),
          timing,
        ),
        layer("rim")?.animate(
          frames.rim.map((clipPath) => ({ clipPath })),
          timing,
        ),
      );
    }
    // Held at their first frame (nothing of the new room showing) until the room has settled, which
    // also keeps the transition open; then one clock for all of it, so the paint never slips
    // against the edge it is painting.
    for (const run of runs) run?.pause();
    await settled();
    const start = document.timeline.currentTime;
    for (const run of runs) if (run) run.startTime = start;
    // The paint's worker keeps its own time from the same start, off the main thread. Pausing the
    // room's clip does not reach it, so whoever freezes a pour to look at it (the checks) says when.
    if (paint?.liquid && start !== null) paint.liquid.start(performance.timeOrigin + Number(start), POUR_MS);
    const hold = (e: Event) => paint?.liquid?.hold(Number((e as CustomEvent<number>).detail));
    window.addEventListener(POUR_HOLD, hold);
    try {
      await transition.finished;
    } finally {
      window.removeEventListener(POUR_HOLD, hold);
    }
  } catch {
    // A pour cut short by the next one: the newer pour owns the attribute and its own paint.
  } finally {
    const paint = laid as { coat: HTMLElement; liquid: Liquid | null } | null;
    paint?.liquid?.dispose();
    paint?.coat.remove();
    if (root.dataset.turn === id) delete root.dataset.turn;
  }
}

/** The shell announces each nook it has drawn, so a turn can wait for the real room. */
export const NOOK_SHOWN = "nook:shown";

/** Resolves once the shell has drawn `slug`, or after `ms`, whichever is first. */
export function shownNook(slug: string, ms = 900): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener(NOOK_SHOWN, on);
      window.clearTimeout(timer);
      resolve();
    };
    const on = (e: Event) => {
      if ((e as CustomEvent<string>).detail === slug) done();
    };
    const timer = window.setTimeout(done, ms);
    window.addEventListener(NOOK_SHOWN, on);
  });
}

/** Where a click came from, or the middle of the element for a keyboard press (which reports 0,0). */
export function originOf(event: { clientX: number; clientY: number; currentTarget: Element }) {
  if (event.clientX || event.clientY) return { x: event.clientX, y: event.clientY };
  const box = event.currentTarget.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}
