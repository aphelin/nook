"use client";

import type { NookMember } from "@nook/contracts";
import { createContext, useContext } from "react";
import type { ResolveMention } from "@/lib/format";

export interface ChatContextValue {
  /** The nook's address, for presence and opening DMs from a person's card. */
  slug: string;
  members: Map<string, NookMember>;
  meId: string;
  /** The root whose thread is open, if any: its summary carries the mark. */
  activeThreadId: string | null;
  openThread: (rootId: string) => void;
  /** @handle → someone in this nook, for mention chips. */
  resolveMention: ResolveMention;
}

export const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside a channel view");
  return ctx;
}

/** "Mara", "Mara and Jonas", "Mara, Jonas and 3 others". */
export function listNames(ids: string[], members: Map<string, NookMember>, meId: string): string {
  const names = ids.map((id) => (id === meId ? "You" : (members.get(id)?.displayName.split(" ")[0] ?? "Someone")));
  if (names.length <= 2) return names.join(" and ");
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}
