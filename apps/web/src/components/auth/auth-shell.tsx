import type { Kit } from "@nook/contracts";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { accentStyle } from "@/lib/accent";
import { SHAPES } from "@/lib/faces";

interface AuthShellProps {
  /** What the panel shows: the live member card on signup, a welcome line on login. */
  panel: ReactNode;
  /** Collapse the panel to just the wordmark band on small screens. */
  compactPanelOnMobile?: boolean;
  /** Take the colours from a nook rather than the house, so an invite arrives in its colours. */
  kit?: Kit;
  children: ReactNode;
}

/** A row of the shapes people are drawn as, in the panel's colours: a crowd with nobody named yet. */
function Crowd() {
  const shapes = ["flower", "circle", "star", "squircle", "drop", "burst"] as const;
  return (
    <span aria-hidden="true" className="hidden gap-2 sm:flex">
      {shapes.map((s, i) => (
        <svg key={s} width="34" height="34" viewBox="0 0 40 40" className="pop-in shrink-0" style={{ animationDelay: `${120 + i * 70}ms` }}>
          <path d={SHAPES[s]} className="tint" style={{ fill: `var(--face-${(i % 3) + 1})` }} />
        </svg>
      ))}
    </span>
  );
}

/**
 * Signing in, in the club's colours. The panel is the room — drenched in the bright colour, a row
 * of people-shapes along its top, something loud said on it — and the form is a card beside it. An
 * invite carries the nook's own kit, so you arrive already in its colours.
 */
export function AuthShell({ panel, compactPanelOnMobile = false, kit, children }: AuthShellProps) {
  return (
    <div
      style={kit ? accentStyle(kit) : undefined}
      className="surface-card grid min-h-dvh grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] lg:grid-rows-1"
    >
      <aside className="surface-stage tint flex flex-col lg:m-3 lg:rounded-card">
        <div
          className={`flex items-center justify-between gap-6 px-6 pt-6 sm:px-10 lg:pt-10 lg:pb-8 ${compactPanelOnMobile ? "pb-9" : "pb-8"}`}
        >
          <Wordmark size="lg" />
          <Crowd />
        </div>
        <div className={`flex-1 items-center px-6 pb-10 sm:px-10 lg:flex lg:pr-14 lg:pb-16 ${compactPanelOnMobile ? "hidden" : "flex"}`}>
          {panel}
        </div>
      </aside>
      <main className="flex items-center justify-center px-6 py-12 sm:px-10 lg:py-16">
        <div className="w-full max-w-[26rem]">{children}</div>
      </main>
    </div>
  );
}
