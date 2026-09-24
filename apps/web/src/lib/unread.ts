"use client";

import { type ChannelUnread, type MarkNotificationsRead, NotificationPage, UNREAD_CAP, UnreadState } from "@nook/contracts";
import { type QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import { api } from "./api";
import { useSession } from "./session";

export const unreadKeys = {
  state: ["unread"] as const,
  inbox: ["notifications"] as const,
};

/**
 * What this tab is reading right now: a channel scrolled to its latest message, or an open thread,
 * while the tab is visible. New activity there is read on arrival, so it never counts as unread.
 */
export const viewing: { channelId: string | null; threadId: string | null } = { channelId: null, threadId: null };

/** Counts are the server's truth. Bursts of activity collapse into one refetch. */
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
export function refreshUnread(qc: QueryClient, { inbox = false } = {}) {
  if (inbox) void qc.invalidateQueries({ queryKey: unreadKeys.inbox });
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void qc.invalidateQueries({ queryKey: unreadKeys.state }), 250);
}

export function useUnread() {
  const signedIn = useSession().state.status === "authenticated";
  return useQuery({
    queryKey: unreadKeys.state,
    queryFn: () => api("/unread", { schema: UnreadState }),
    enabled: signedIn,
    // The socket says when it changes.
    staleTime: Infinity,
  });
}

const NONE: ChannelUnread[] = [];
export function useChannelUnreads(): Map<string, ChannelUnread> {
  const { data } = useUnread();
  const list = data?.channels ?? NONE;
  return useMemo(() => new Map(list.map((c) => [c.channelId, c])), [list]);
}

/** "7", "999+". Tight spots (the crest rail) pass a lower cap: "99+". */
export const countLabel = (n: number, cap = UNREAD_CAP) => (n >= cap ? `${cap - 1}+` : String(n));

/** Moves your read pointer forward (never back) and clears the channel's counts right away. */
export function useReadChannel(channelId: string) {
  const qc = useQueryClient();
  const sent = useRef<string>("");
  return useCallback(
    (messageId: string) => {
      if (messageId <= sent.current) return;
      const entry = qc.getQueryData<UnreadState>(unreadKeys.state)?.channels.find((c) => c.channelId === channelId);
      if (entry?.lastReadId && messageId <= entry.lastReadId) return;
      sent.current = messageId;
      qc.setQueryData<UnreadState>(
        unreadKeys.state,
        (s) =>
          s && {
            ...s,
            channels: s.channels.map((c) => (c.channelId === channelId ? { ...c, unread: 0, mentions: 0, lastReadId: messageId } : c)),
          },
      );
      void api(`/channels/${channelId}/read`, { method: "POST", body: { messageId } }).catch(() => {
        sent.current = "";
        refreshUnread(qc);
      });
    },
    [qc, channelId],
  );
}

export function markNotificationsRead(input: MarkNotificationsRead) {
  return api("/notifications/read", { method: "POST", body: input });
}

export function useNotifications(enabled: boolean) {
  const signedIn = useSession().state.status === "authenticated";
  return useInfiniteQuery({
    queryKey: unreadKeys.inbox,
    queryFn: ({ pageParam }) => api(`/notifications?limit=20${pageParam ? `&before=${pageParam}` : ""}`, { schema: NotificationPage }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: signedIn && enabled,
  });
}

/** Marks some or all of your notifications read, showing it immediately. */
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markNotificationsRead,
    onMutate: (input) => {
      const now = new Date().toISOString();
      const hit = (id: string) => ("all" in input ? true : "ids" in input ? input.ids.includes(id) : false);
      let cleared = 0;
      qc.setQueryData<{ pages: NotificationPage[]; pageParams: unknown[] }>(
        unreadKeys.inbox,
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((p) => ({
              ...p,
              items: p.items.map((n) => {
                if (n.readAt || !hit(n.id)) return n;
                cleared++;
                return { ...n, readAt: now };
              }),
            })),
          },
      );
      qc.setQueryData<UnreadState>(unreadKeys.state, (s) => s && { ...s, inbox: "all" in input ? 0 : Math.max(0, s.inbox - cleared) });
    },
    onSettled: () => refreshUnread(qc),
  });
}
