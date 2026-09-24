"use client";

import type { Kit } from "@nook/contracts";
import { type CSSProperties, useSyncExternalStore } from "react";
import { accentStyle } from "@/lib/accent";

/*
 * The wipe: changing nooks, the new club's colour floods out from the disc you pressed, like a
 * story advancing, and lifts away over a room that has already taken the new colours.
 *
 * It lives outside the shell (mounted once by the shell layout) because the shell itself swaps
 * between the loaded nook and its skeleton mid-navigation, and the wipe has to outlive both.
 */

interface WipeState {
  key: number;
  kit: Kit;
  x: number;
  y: number;
}

let current: WipeState | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Starts a wipe into `kit` from a point on screen. Does nothing under reduced motion. */
export function wipeTo(kit: Kit, x: number, y: number) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  current = { key: Date.now(), kit, x, y };
  emit();
}

/** Where a click came from, or the middle of the element for a keyboard press (which reports 0,0). */
export function originOf(event: { clientX: number; clientY: number; currentTarget: Element }) {
  if (event.clientX || event.clientY) return { x: event.clientX, y: event.clientY };
  const box = event.currentTarget.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

export function Wipe() {
  const wipe = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => current,
    () => null,
  );
  if (!wipe) return null;
  return (
    <div
      key={wipe.key}
      aria-hidden="true"
      style={{ ...accentStyle(wipe.kit), "--wipe-x": `${wipe.x}px`, "--wipe-y": `${wipe.y}px` } as CSSProperties}
      className="wipe pointer-events-none fixed inset-0 z-[80] bg-stage"
      onAnimationEnd={(e) => {
        if (e.animationName === "wipe-lift" && current?.key === wipe.key) {
          current = null;
          emit();
        }
      }}
    />
  );
}
