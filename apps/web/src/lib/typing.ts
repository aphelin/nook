"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** Who is typing where. A typing signal lives for a few seconds unless renewed. */
const TYPING_TTL_MS = 5000;

const typing = new Map<string, Map<string, number>>(); // channelId → userId → expires at
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  for (const l of listeners) l();
};

export const typingStore = {
  add(channelId: string, userId: string) {
    const channel = typing.get(channelId) ?? new Map<string, number>();
    channel.set(userId, Date.now() + TYPING_TTL_MS);
    typing.set(channelId, channel);
    emit();
  },
  /** Someone's message arrived: they've stopped typing it. */
  clear(channelId: string, userId: string) {
    if (typing.get(channelId)?.delete(userId)) emit();
  },
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The user ids currently typing in a channel, re-evaluated as signals expire. */
export function useTyping(channelId: string): string[] {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  const [now, setNow] = useState(() => Date.now());
  const entries = [...(typing.get(channelId)?.entries() ?? [])].filter(([, until]) => until > now);
  const nextExpiry = Math.min(...entries.map(([, until]) => until));

  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return;
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, nextExpiry - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [nextExpiry]);

  // A new signal may arrive after `now` was last taken; re-read the clock on every store change.
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(t);
  }, [entries.length]);

  return entries.map(([userId]) => userId);
}
