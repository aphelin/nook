"use client";

import { type Attachment, Message, MessagePage } from "@nook/contracts";
import {
  type InfiniteData,
  infiniteQueryOptions,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { api } from "./api";
import { useRealtime } from "./realtime";
import { useSession } from "./session";

/** A message as the client holds it: saved, or still on its way. */
export type ClientMessage = Message & { status?: "sending" | "failed" };
type Pages = InfiniteData<{ items: ClientMessage[]; nextCursor: string | null }, unknown>;

export const messageKeys = {
  channel: (channelId: string) => ["messages", channelId] as const,
  thread: (rootId: string) => ["thread", rootId] as const,
  one: (id: string) => ["message", id] as const,
};

/** Replies live in their thread's cache; everything else in the channel's. */
const keyFor = (m: Pick<Message, "channelId" | "threadRootId">) =>
  m.threadRootId ? messageKeys.thread(m.threadRootId) : messageKeys.channel(m.channelId);

const PAGE_SIZE = 50;

/**
 * A refetch (e.g. after reconnecting) replaces the newest page with the server's copy. Two kinds of
 * message aren't in that copy and would silently vanish: ones still sending or failed, and ones that
 * arrived over the socket while the request was in flight. Carry both over. UUIDv7 ids are time-ordered,
 * so "arrived later" is simply "id greater than the newest id in the response".
 */
function keepLocal(qc: QueryClient, key: readonly unknown[], page: MessagePage, isNewest: boolean) {
  if (!isNewest) return page;
  const old = qc.getQueryData<Pages>(key);
  if (!old) return page;
  const fetchedIds = new Set(page.items.map((m) => m.id));
  const fetchedClientIds = new Set(page.items.map((m) => m.clientId).filter(Boolean));
  const newest = page.items.at(-1)?.id ?? "";
  const carried = old.pages
    .flatMap((p) => p.items)
    .filter((m) => (m.status ? !fetchedClientIds.has(m.clientId) : m.id > newest && !fetchedIds.has(m.id)));
  if (carried.length === 0) return page;
  // Saved ones first, in time order, then anything still on its way.
  const saved = carried.filter((m) => !m.status).sort((a, b) => (a.id < b.id ? -1 : 1));
  const unsent = carried.filter((m) => m.status);
  return { ...page, items: [...page.items, ...saved, ...unsent] };
}

/**
 * A channel you have left keeps its history for half an hour rather than TanStack's default five
 * minutes. The socket keeps a cached channel current while you're elsewhere, so going back to one
 * is instant instead of a skeleton and a fresh fetch.
 */
const HISTORY_KEPT_MS = 30 * 60_000;

function channelHistory(qc: QueryClient, channelId: string) {
  const key = messageKeys.channel(channelId);
  return infiniteQueryOptions({
    queryKey: key,
    queryFn: async ({ pageParam }) =>
      keepLocal(
        qc,
        key,
        await api(`/channels/${channelId}/messages?limit=${PAGE_SIZE}${pageParam ? `&before=${pageParam}` : ""}`, { schema: MessagePage }),
        !pageParam,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    // Live updates arrive over the socket; refetching would only reshuffle what we have.
    staleTime: Infinity,
    gcTime: HISTORY_KEPT_MS,
  });
}

/** Loads a channel's latest messages into the cache (a cached channel is left alone). */
export function prefetchHistory(qc: QueryClient, channelId: string): Promise<void> {
  return qc.prefetchInfiniteQuery(channelHistory(qc, channelId));
}

export function useMessages(channelId: string) {
  const signedIn = useSession().state.status === "authenticated";
  const qc = useQueryClient();
  return useInfiniteQuery({ ...channelHistory(qc, channelId), enabled: signedIn });
}

/**
 * Starts loading a channel's latest messages before you open it, from the moment you point at or
 * focus its row. That head start is usually the whole fetch, so the switch lands on history already
 * in hand. A channel that is already cached is left alone.
 */
export function usePrefetchChannel() {
  const signedIn = useSession().state.status === "authenticated";
  const qc = useQueryClient();
  return useCallback(
    (channelId: string) => {
      if (signedIn) void prefetchHistory(qc, channelId);
    },
    [qc, signedIn],
  );
}

export function useThread(rootId: string) {
  const signedIn = useSession().state.status === "authenticated";
  const qc = useQueryClient();
  const key = messageKeys.thread(rootId);
  return useInfiniteQuery({
    queryKey: key,
    queryFn: async ({ pageParam }) =>
      keepLocal(
        qc,
        key,
        await api(`/messages/${rootId}/replies?limit=${PAGE_SIZE}${pageParam ? `&before=${pageParam}` : ""}`, { schema: MessagePage }),
        !pageParam,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: signedIn,
    staleTime: Infinity,
  });
}

/** A single message: the thread root, when it isn't already in the loaded channel history. */
export function useMessage(id: string, fallback: Message | undefined) {
  const signedIn = useSession().state.status === "authenticated";
  return useQuery({
    queryKey: messageKeys.one(id),
    queryFn: () => api(`/messages/${id}`, { schema: Message }),
    enabled: signedIn && !fallback,
    initialData: fallback,
  });
}

/** Oldest first, across every loaded page. */
export function flatten(data: Pages | undefined): ClientMessage[] {
  if (!data) return [];
  return data.pages.toReversed().flatMap((p) => p.items);
}

function updatePages(qc: QueryClient, key: readonly string[], fn: (pages: Pages) => Pages) {
  qc.setQueryData<Pages>(key, (data) => (data ? fn(data) : data));
}

function mapItems(pages: Pages, fn: (m: ClientMessage) => ClientMessage | null): Pages {
  return {
    ...pages,
    pages: pages.pages.map((p) => ({ ...p, items: p.items.flatMap((m) => fn(m) ?? []) })),
  };
}

/**
 * Adds a saved message to the cache, whichever arrives first: the broadcast or the ack.
 * An optimistic copy with the same clientId is replaced in place, so the row never jumps.
 */
export function upsertMessage(qc: QueryClient, message: Message) {
  qc.setQueryData<Message>(messageKeys.one(message.id), (old) => (old ? message : old));
  updatePages(qc, keyFor(message), (pages) => {
    let placed = false;
    const next = mapItems(pages, (m) => {
      if (m.id === message.id || (message.clientId && m.clientId === message.clientId)) {
        if (placed) return null;
        placed = true;
        return message;
      }
      return m;
    });
    if (placed || next.pages.length === 0) return next;
    const [newest, ...older] = next.pages;
    return { ...next, pages: [{ ...newest!, items: [...newest!.items, message] }, ...older] };
  });
}

function setStatus(qc: QueryClient, key: readonly string[], clientId: string, status: ClientMessage["status"]) {
  updatePages(qc, key, (pages) => mapItems(pages, (m) => (m.clientId === clientId && m.status ? { ...m, status } : m)));
}

function removePending(qc: QueryClient, key: readonly string[], clientId: string) {
  updatePages(qc, key, (pages) => mapItems(pages, (m) => (m.clientId === clientId && m.status ? null : m)));
}

/** Optimistic send over the socket, with retry and discard for failures. Pass a root to reply in its thread. */
export function useSendMessage(channelId: string, threadRootId: string | null = null) {
  const key = threadRootId ? messageKeys.thread(threadRootId) : messageKeys.channel(channelId);
  const qc = useQueryClient();
  const { socket } = useRealtime();
  const { state } = useSession();

  async function deliver(clientId: string, body: string, attachmentIds: string[]) {
    setStatus(qc, key, clientId, "sending");
    try {
      if (!socket) throw new Error("offline");
      const ack = (await socket.timeout(8000).emitWithAck("message:send", { clientId, channelId, body, threadRootId, attachmentIds })) as
        { ok: true; data: Message } | { ok: false; error: string };
      if (!ack.ok) throw new Error(ack.error);
      upsertMessage(qc, ack.data);
    } catch {
      setStatus(qc, key, clientId, "failed");
    }
  }

  return {
    send(body: string, attachments: Attachment[] = []) {
      if (state.status !== "authenticated") return;
      const clientId = uuidv4();
      const pending: ClientMessage = {
        id: `pending-${clientId}`,
        clientId,
        channelId,
        authorId: state.user.id,
        kind: "user",
        body,
        threadRootId,
        replyCount: 0,
        lastReplyAt: null,
        replyAuthorIds: [],
        reactions: [],
        attachments,
        linkPreviews: [],
        mentions: [],
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        status: "sending",
      };
      updatePages(qc, key, (pages) => {
        const [newest, ...older] = pages.pages;
        return newest ? { ...pages, pages: [{ ...newest, items: [...newest.items, pending] }, ...older] } : pages;
      });
      void deliver(
        clientId,
        body,
        attachments.map((a) => a.id),
      );
    },
    retry: (m: ClientMessage) =>
      m.clientId &&
      void deliver(
        m.clientId,
        m.body,
        m.attachments.map((a) => a.id),
      ),
    discard: (m: ClientMessage) => m.clientId && removePending(qc, key, m.clientId),
  };
}

export function useEditMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      api(`/messages/${id}`, { method: "PATCH", body: { body }, schema: Message }),
    onSuccess: (message) => upsertMessage(qc, message),
  });
}

export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (m: Message) => api(`/messages/${m.id}`, { method: "DELETE" }),
    onSuccess: (_, m) => upsertMessage(qc, { ...m, body: "", deletedAt: new Date().toISOString() }),
  });
}

/** Toggles your reaction; the saved message comes back (and to everyone else over the socket). */
export function useToggleReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ message, emoji, add }: { message: Message; emoji: string; add: boolean }) =>
      api(`/messages/${message.id}/reactions/${encodeURIComponent(emoji)}`, { method: add ? "PUT" : "DELETE", schema: Message }),
    onSuccess: (message) => upsertMessage(qc, message),
  });
}
