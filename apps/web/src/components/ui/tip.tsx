"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactElement } from "react";

/**
 * A name on hover or focus: a small card pill beside the thing it names, the same one the landing's
 * club discs use. For controls whose only face is a shape (a club's disc on the rail), in place of
 * the browser's own `title` box. Put a `Tooltip.Provider` round a row of them for a shared delay.
 */
export function Tip({
  label,
  side = "top",
  children,
}: {
  label: string;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactElement;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner side={side} sideOffset={10} className="z-50">
          <Tooltip.Popup className="surface-card rounded-full px-3.5 py-2 text-sm font-bold shadow-float">{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
