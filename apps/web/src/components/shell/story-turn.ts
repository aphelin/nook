"use client";

import { reducedMotion } from "@/lib/motion";

/*
 * The story turn: changing clubs turns the screen like the faces of a cube, the way stories move
 * from one account to the next. The browser snapshots the room you are leaving, the new club is
 * drawn, and the two snapshots turn together about their shared edge (globals.css, `data-turn`):
 * further down the rail turns forward (the new room comes in from the right), back up turns back.
 *
 * Both faces are real screens rather than a colour laid over one, and while the turn runs the
 * usual re-tint is switched off, so the incoming face arrives already in its club's colours. With
 * no View Transitions in the browser, or under reduced motion, the change is simply made.
 */

export type Turn = "next" | "prev";

type Transitioning = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => { finished: Promise<void> };
};

export async function turn(direction: Turn, update: () => Promise<void> | void): Promise<void> {
  const doc = document as Transitioning;
  if (!doc.startViewTransition || reducedMotion()) {
    await update();
    return;
  }
  const root = document.documentElement;
  root.dataset.turn = direction;
  try {
    await doc.startViewTransition(update).finished;
  } catch {
    // A turn cut short by the next one: the newer turn owns the attribute now.
  } finally {
    if (root.dataset.turn === direction) delete root.dataset.turn;
  }
}

/** Forward if the club you picked is further down the list than the one you are in. */
export const directionOf = (from: number, to: number): Turn => (to >= from ? "next" : "prev");

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
