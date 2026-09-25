"use client";

import { Popover } from "@base-ui/react/popover";
import { EmojiPicker as Frimousse } from "frimousse";
import type { ComponentProps, ReactNode } from "react";

interface EmojiPickerProps {
  trigger: ComponentProps<typeof Popover.Trigger>["render"];
  triggerContent: ReactNode;
  triggerLabel: string;
  onPick: (emoji: string) => void;
}

/** Frimousse (headless, virtualized) inside the shell's popover surface. */
export function EmojiPicker({ trigger, triggerContent, triggerLabel, onPick }: EmojiPickerProps) {
  return (
    <Popover.Root>
      <Popover.Trigger render={trigger} aria-label={triggerLabel}>
        {triggerContent}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <Popover.Popup className="surface-card origin-[var(--transform-origin)] overflow-hidden rounded-[1.5rem] shadow-float outline-none transition-[scale,opacity] duration-200 ease-out-expo data-[ending-style]:scale-90 data-[ending-style]:opacity-0 data-[starting-style]:scale-90 data-[starting-style]:opacity-0">
            <Popover.Title className="sr-only">Pick an emoji</Popover.Title>
            <Frimousse.Root
              columns={8}
              onEmojiSelect={({ emoji }) => onPick(emoji)}
              className="isolate flex h-[22rem] w-[21rem] max-w-[calc(100vw-1.5rem)] flex-col"
            >
              <div className="p-2">
                <Frimousse.Search
                  aria-label="Search emoji"
                  placeholder="Search emoji"
                  className="h-11 w-full rounded-full bg-chip px-4 text-base text-on-chip outline-none placeholder:text-fg-2 focus-visible:inset-ring-2 focus-visible:inset-ring-hi [&::-webkit-search-cancel-button]:appearance-none"
                />
              </div>
              {/* The scrollbar's gutter on both sides, so the grid stays centred when it is showing. */}
              <Frimousse.Viewport className="relative flex-1 outline-none ![scrollbar-gutter:stable_both-edges]">
                <Frimousse.Loading className="absolute inset-0 flex items-center justify-center text-sm text-fg-2">
                  Loading emoji…
                </Frimousse.Loading>
                <Frimousse.Empty className="absolute inset-0 flex items-center justify-center text-sm text-fg-2">
                  No emoji by that name.
                </Frimousse.Empty>
                <Frimousse.List
                  className="pb-2 select-none"
                  components={{
                    CategoryHeader: ({ category, ...props }) => (
                      <div {...props} className="bg-bg px-3.5 pt-3 pb-1.5 text-xs font-bold text-fg-2">
                        {category.label}
                      </div>
                    ),
                    // Eight even columns across the same width as the search field, so the grid sits
                    // centred under it instead of leaving its spare width all on the right.
                    Row: ({ children, ...props }) => (
                      // (important: the library sets display:flex on each row inline)
                      <div {...props} className="!grid scroll-my-1.5 grid-cols-8 justify-items-center px-2">
                        {children}
                      </div>
                    ),
                    Emoji: ({ emoji, ...props }) => (
                      <button
                        {...props}
                        aria-label={emoji.label}
                        className="grid size-9 place-items-center rounded-full text-xl transition-[scale] duration-150 ease-out-expo data-[active]:scale-110 data-[active]:bg-chip"
                      >
                        {emoji.emoji}
                      </button>
                    ),
                  }}
                />
              </Frimousse.Viewport>
            </Frimousse.Root>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
