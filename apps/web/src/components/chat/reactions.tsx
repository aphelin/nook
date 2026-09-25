"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import type { Message } from "@nook/contracts";
import { Smiley } from "@phosphor-icons/react/dist/ssr";
import { useLayoutEffect, useRef } from "react";
import { Avatar } from "@/components/ui/avatar";
import { EmojiPicker } from "./emoji-picker";
import { useToggleReaction } from "@/lib/messages";
import { reducedMotion } from "@/lib/motion";
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
  const toggle = useToggleReaction();
  if (message.reactions.length === 0) return null;

  return (
    <Tooltip.Provider delay={300}>
      <ul aria-label="Reactions" className="relative z-10 mt-1.5 flex flex-wrap items-center gap-1.5">
        {message.reactions.map((r) => (
          <ReactionChip key={r.emoji} message={message} reaction={r} />
        ))}
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

/** The house's arrival curve, read from its token so there is one definition of it (globals.css `--ease-pop`). */
const popEase = () => getComputedStyle(document.documentElement).getPropertyValue("--ease-pop").trim() || "ease-out";

/**
 * One reaction. What changes while you watch lands, the way the room's arrivals do: your own
 * reaction pops the chip as it fills with the highlight, and a face joining an existing chip
 * slaps down beside the others. Nothing pops for chips that were already there when the message
 * came on screen, so opening a busy channel stays calm.
 */
function ReactionChip({ message, reaction: r }: { message: Message; reaction: Message["reactions"][number] }) {
  const { members, meId } = useChat();
  const toggle = useToggleReaction();
  const chip = useRef<HTMLButtonElement>(null);
  const faceBox = useRef<HTMLSpanElement>(null);
  const seen = useRef<{ mine: boolean; ids: Set<string>; count: number } | null>(null);
  const mine = r.userIds.includes(meId);
  const who = listNames(r.userIds, members, meId);
  const faces = r.userIds
    .slice(0, FACES)
    .map((id) => members.get(id))
    .filter((m) => !!m);

  useLayoutEffect(() => {
    const before = seen.current;
    seen.current = { mine, ids: new Set(r.userIds), count: r.count };
    if (!before || reducedMotion()) return;
    if (mine !== before.mine && chip.current) {
      // One keyframe: it lands on whatever the chip rests at (1.05 while hovered), with no snap at the end.
      chip.current.animate([{ scale: mine ? 0.8 : 0.9 }], { duration: 380, easing: popEase() });
    }
    for (const el of faceBox.current?.querySelectorAll<HTMLElement>("[data-face]") ?? []) {
      if (!before.ids.has(el.dataset.face!)) el.animate([{ scale: 0.4, opacity: 0 }], { duration: 380, easing: popEase() });
    }
  }, [mine, r.userIds, r.count]);

  return (
    <li>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={
            <button
              ref={chip}
              type="button"
              aria-pressed={mine}
              aria-label={`${r.emoji} ${r.count}: ${who}. ${mine ? "Remove your reaction" : "Add yours"}`}
              onClick={() => toggle.mutate({ message, emoji: r.emoji, add: !mine })}
              className={`tint press inline-flex h-8 items-center gap-1.5 rounded-full pr-2.5 pl-2 text-sm leading-none hover:scale-105 ${
                mine
                  ? "bg-hi font-extrabold text-on-hi [--face-1:var(--on-hi)] [--face-2:var(--on-hi)] [--face-3:var(--on-hi)] [--on-face-1:var(--hi)] [--on-face-2:var(--hi)] [--on-face-3:var(--hi)]"
                  : // The surface's own chip, so a reaction reads on the room and on a card alike (a card-coloured
                    // chip on a card vanished), with the faces a card gives people: the day room's chip is white,
                    // and one of the room's own face colours is white too.
                    "bg-chip font-bold text-on-chip [--face-1:var(--card-face-1)] [--face-2:var(--card-face-2)] [--face-3:var(--card-face-3)] [--on-face-1:var(--card-on-face-1)] [--on-face-2:var(--card-on-face-2)] [--on-face-3:var(--card-on-face-3)]"
              }`}
            />
          }
        >
          <span aria-hidden="true" className="text-base leading-none">
            {r.emoji}
          </span>
          {faces.length > 0 ? (
            <span ref={faceBox} aria-hidden="true" className="flex -space-x-1.5">
              {faces.map((m) => (
                <span key={m.id} data-face={m.id} className="inline-flex">
                  <Avatar user={m} size={18} />
                </span>
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
}
