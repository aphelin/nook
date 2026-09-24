"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import type { Message } from "@nook/contracts";
import { Smiley } from "@phosphor-icons/react/dist/ssr";
import { Avatar } from "@/components/ui/avatar";
import { EmojiPicker } from "./emoji-picker";
import { useToggleReaction } from "@/lib/messages";
import { listNames, useChat } from "./chat-context";

/** How many faces a chip shows before it falls back to the count alone. */
const FACES = 3;

/**
 * Reactions: pills under the message, each carrying the shapes of the people behind it. Every other
 * chat app spends a hover to answer "who reacted"; here it is simply on screen.
 *
 * The pills are cards (white by day) resting on the colour. Yours is the room's highlight instead
 * — a solid fill of the club's other colour, and bold — so "you reacted" survives without colour
 * too, and `aria-pressed` carries it to assistive tech.
 */
export function ReactionBar({ message }: { message: Message }) {
  const { members, meId } = useChat();
  const toggle = useToggleReaction();
  if (message.reactions.length === 0) return null;

  return (
    <Tooltip.Provider delay={300}>
      <ul aria-label="Reactions" className="relative z-10 mt-1.5 flex flex-wrap items-center gap-1.5">
        {message.reactions.map((r) => {
          const mine = r.userIds.includes(meId);
          const who = listNames(r.userIds, members, meId);
          const faces = r.userIds
            .slice(0, FACES)
            .map((id) => members.get(id))
            .filter((m) => !!m);
          return (
            <li key={r.emoji}>
              <Tooltip.Root>
                <Tooltip.Trigger
                  render={
                    <button
                      type="button"
                      aria-pressed={mine}
                      aria-label={`${r.emoji} ${r.count}: ${who}. ${mine ? "Remove your reaction" : "Add yours"}`}
                      onClick={() => toggle.mutate({ message, emoji: r.emoji, add: !mine })}
                      className={`tint press inline-flex h-8 items-center gap-1.5 rounded-full pr-2.5 pl-2 text-sm leading-none hover:scale-105 ${
                        mine
                          ? "bg-hi font-extrabold text-on-hi [--face-1:var(--on-hi)] [--face-2:var(--on-hi)] [--face-3:var(--on-hi)] [--on-face-1:var(--hi)] [--on-face-2:var(--hi)] [--on-face-3:var(--hi)]"
                          : "surface-card font-bold"
                      }`}
                    />
                  }
                >
                  <span aria-hidden="true" className="text-base leading-none">
                    {r.emoji}
                  </span>
                  {faces.length > 0 ? (
                    <span aria-hidden="true" className="flex -space-x-1.5">
                      {faces.map((m) => (
                        <Avatar key={m.id} user={m} size={18} />
                      ))}
                    </span>
                  ) : null}
                  {r.count > faces.length && (
                    <span data-num className="font-semibold">
                      {r.count > FACES ? `+${r.count - FACES}` : r.count}
                    </span>
                  )}
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner sideOffset={8} className="z-50">
                    <Tooltip.Popup className="surface-card max-w-[16rem] rounded-chip px-3 py-2 text-sm font-medium shadow-float">
                      {who} reacted with {r.emoji}
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
            </li>
          );
        })}
        <li>
          <EmojiPicker
            triggerLabel="Add a reaction"
            onPick={(emoji) => toggle.mutate({ message, emoji, add: true })}
            trigger={
              <button
                type="button"
                className="inline-grid h-8 w-9 place-items-center rounded-full bg-hover text-fg transition-[scale,background-color] duration-150 ease-out-expo hover:scale-105 hover:bg-hover-strong"
              />
            }
            triggerContent={<Smiley size={17} weight="bold" aria-hidden="true" />}
          />
        </li>
      </ul>
    </Tooltip.Provider>
  );
}
