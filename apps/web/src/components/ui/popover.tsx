"use client";

import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ComponentProps, ReactNode } from "react";

interface PopoverProps {
  trigger: ComponentProps<typeof BasePopover.Trigger>["render"];
  triggerContent: ReactNode;
  triggerLabel?: string;
  title: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  children: ReactNode;
  className?: string;
}

/**
 * The one floating surface: a card over the colour. It is the only thing in the shell that casts a
 * shadow; docked surfaces separate by colour alone, and something genuinely over the room has to
 * say so.
 */
export function Popover({
  trigger,
  triggerContent,
  triggerLabel,
  title,
  open,
  onOpenChange,
  side = "bottom",
  align = "start",
  children,
  className = "w-[21rem]",
}: PopoverProps) {
  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange}>
      <BasePopover.Trigger render={trigger} aria-label={triggerLabel}>
        {triggerContent}
      </BasePopover.Trigger>
      <BasePopover.Portal>
        <BasePopover.Positioner side={side} align={align} sideOffset={10} collisionPadding={12} className="z-50">
          <BasePopover.Popup
            className={`surface-card max-w-[calc(100vw-1.5rem)] origin-[var(--transform-origin)] rounded-card p-5 shadow-float outline-none transition-[scale,opacity] duration-200 ease-out-expo data-[ending-style]:scale-90 data-[ending-style]:opacity-0 data-[starting-style]:scale-90 data-[starting-style]:opacity-0 ${className}`}
          >
            <BasePopover.Title className="font-display text-xl leading-none font-extrabold tracking-[-0.02em]">{title}</BasePopover.Title>
            <div className="mt-4">{children}</div>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
