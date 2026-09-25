"use client";

import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";

interface ButtonProps extends Omit<ComponentProps<typeof BaseButton>, "children" | "className"> {
  /** Optional so the button can serve as a `render` target that receives its children from a trigger. */
  children?: ReactNode;
  variant?: Variant;
  /** Shows the pending label and blocks re-submission while keeping focus on the button. */
  pending?: boolean;
  pendingLabel?: ReactNode;
  className?: string;
}

/*
 * Buttons are pills of solid colour.
 *
 * Primary is the surface's highlight — the club's other colour, whichever surface the button sits
 * on — and carries `tint`, so it changes with the room. Secondary is a chip resting on the
 * surface; ghost is bare type that takes a wash on hover; link is bare type set flush with the text
 * around it, underlined. Nothing is outlined to look clickable, and pressing squashes the pill a
 * little rather than darkening it. A pending button keeps its colour (it is busy, not unavailable)
 * and only a disabled one fades.
 */
const VARIANTS: Record<Variant, string> = {
  primary: "tint h-11 px-5 bg-hi text-on-hi hover:brightness-110",
  secondary: "tint h-11 px-5 bg-chip text-on-chip hover:brightness-95",
  ghost: "h-11 px-4 text-fg-2 transition-colors duration-150 hover:bg-hover hover:text-fg",
  danger: "h-11 px-5 bg-alert text-bg transition-[filter] duration-150 hover:brightness-110",
  link: "h-9 px-0 text-fg underline decoration-[1.5px] underline-offset-[0.2em] transition-colors duration-150 hover:text-fg-2",
};

export function Button({ children, variant = "primary", pending = false, pendingLabel, className = "", disabled, ...props }: ButtonProps) {
  return (
    <BaseButton
      {...props}
      disabled={disabled || pending}
      focusableWhenDisabled
      aria-busy={pending || undefined}
      className={`press inline-flex items-center justify-center gap-2 rounded-full text-base font-bold whitespace-nowrap data-[disabled]:[animation:none] ${
        pending ? "cursor-progress" : "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
      } ${VARIANTS[variant]} ${className}`}
    >
      {pending ? (pendingLabel ?? children) : children}
    </BaseButton>
  );
}
