"use client";

import type { Kit } from "@nook/contracts";
import { accentStyle } from "@/lib/accent";
import { NookRail } from "./nook-rail";

/*
 * Loading is the same screen in the club's colours with the words not yet in it.
 *
 * Placeholders are flat pills of `hover` on the real surfaces at the real sizes, and they never
 * shimmer: a sweep across a loading screen is decoration that says nothing about state.
 */
const bar = "rounded-full bg-hover";

/** Message rows as quiet placeholders: the transcript's rhythm, without content. */
export function TranscriptSkeleton({ rows = 6 }: { rows?: number }) {
  const widths = ["58%", "34%", "72%", "26%", "48%", "40%", "64%"];
  return (
    <div aria-hidden="true" className="flex flex-1 flex-col justify-end gap-5 overflow-hidden px-6 pb-8 md:px-8">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-3">
          <span className="size-11 rounded-full bg-hover" />
          <span className="flex flex-col gap-2 pt-1">
            <span className={`${bar} h-3.5 w-28`} />
            <span className={`${bar} h-4`} style={{ width: widths[i % widths.length] }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The shell while a nook loads: the real rail, and the list and conversation as placeholders in
 * the nook's own accent where we already know it, so nothing flashes to the house colours first.
 */
export function ShellSkeleton({ kit, name }: { kit?: Kit; name?: string }) {
  return (
    <div
      style={kit ? accentStyle(kit) : undefined}
      aria-busy="true"
      className="surface-stage grid h-dvh grid-cols-[minmax(0,1fr)] md:grid-cols-[76px_280px_minmax(0,1fr)]"
    >
      <p className="sr-only" role="status">
        Loading {name ?? "this nook"}…
      </p>
      <div className="hidden md:block">
        <NookRail activeSlug={null} />
      </div>
      <div aria-hidden="true" className="surface-wing hidden md:block">
        <div className="px-5 pt-6">
          {name ? (
            <p className="line-clamp-2 font-display text-[2rem] leading-[0.95] font-extrabold tracking-[-0.03em]">{name}</p>
          ) : (
            <span className={`${bar} block h-7 w-40`} />
          )}
          <span className={`${bar} mt-3 block h-3 w-20`} />
        </div>
        <div className="mt-5 flex flex-col gap-2 px-3.5">
          <span className={`${bar} block h-11 w-full`} />
          <span className={`${bar} block h-11 w-full`} />
        </div>
        <div className="mt-7 flex flex-col gap-2.5 px-3.5">
          {["62%", "48%", "72%", "54%", "40%"].map((w) => (
            <span key={w} className={`${bar} block h-9`} style={{ width: w }} />
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-col">
        <div aria-hidden="true" className="flex shrink-0 flex-col gap-4 px-4 pt-5 pb-3 md:px-8 md:pt-8">
          <span className={`${bar} block h-14 w-72 max-w-full`} />
          <span className={`${bar} block h-3.5 w-48`} />
        </div>
        <TranscriptSkeleton />
        <div aria-hidden="true" className="px-3 pb-3 md:px-6 md:pb-5">
          <span className="surface-card block h-14 w-full rounded-[1.75rem] shadow-card" />
        </div>
      </div>
    </div>
  );
}
