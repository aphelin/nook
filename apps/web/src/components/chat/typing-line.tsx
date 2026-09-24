"use client";

import type { NookMember } from "@nook/contracts";
import { useTyping } from "@/lib/typing";

function describe(names: string[]): string {
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  return "Several people are typing";
}

/**
 * Three dots, breathing in sequence.
 *
 * This is the one place in the shell where something moves on its own, and it earns that because
 * it is reporting something that is genuinely happening right now — somebody is mid-sentence. An
 * animated ellipsis says "still going" in a way a static one cannot. Under reduced motion the
 * dots hold still and the sentence keeps its full stop.
 *
 * The line always takes its height, so the transcript never jumps when someone starts or stops.
 */
export function TypingLine({ channelId, members, meId }: { channelId: string; members: NookMember[]; meId: string }) {
  const typing = useTyping(channelId).filter((id) => id !== meId);
  const names = typing.map((id) => members.find((m) => m.id === id)?.displayName.split(" ")[0] ?? "Someone");
  const active = names.length > 0;
  return (
    <p aria-live="polite" className="flex h-6 shrink-0 items-center gap-1.5 truncate px-6 text-xs text-fg-2 md:px-8">
      {active && (
        <span aria-hidden="true" className="flex shrink-0 items-center gap-[3px] pb-px">
          {[0, 1, 2].map((i) => (
            <span key={i} className="typing-dot size-[3px] rounded-full bg-fg-2" style={{ animationDelay: `${i * 0.16}s` }} />
          ))}
        </span>
      )}
      <span className="truncate">{active ? describe(names) : ""}</span>
      {/* The sentence is complete for a screen reader whether or not the dots are moving. */}
      <span className="sr-only">{active ? "…" : ""}</span>
    </p>
  );
}
