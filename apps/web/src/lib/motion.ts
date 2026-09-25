"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";

/*
 * GSAP, in the house's motion vocabulary.
 *
 * The same two curves the CSS uses (globals.css `--ease` and `--ease-pop`) under the same names, so
 * a tween and a transition side by side move alike: "nook" is the expo ease-out for hover, state and
 * travel; "nook-pop" goes a little past and back, for arrivals only. Everything that animates here
 * asks `reducedMotion()` first and lands at once when it is set.
 */
gsap.registerPlugin(useGSAP, CustomEase);
CustomEase.create("nook", "0.16,1,0.3,1");
CustomEase.create("nook-pop", "0.3,1.4,0.55,1");
// A shape turning into another: gathering, then most of the change through the middle, so the
// shapes in between are there to see (the expo ease-out did nine tenths of it in the first 100ms).
CustomEase.create("nook-morph", "0.55,0,0.3,1");

export { gsap, useGSAP };

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A house curve as CSS reads it (`--ease` or `--ease-pop`), for the Web Animations API, which cannot take var(). */
export function cssEase(token: "--ease" | "--ease-pop"): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || "ease-out";
}
