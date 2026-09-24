"use client";

import { type ManualStatus, Message, Notification, type PresenceState, PublicUser } from "@nook/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";
import { getAccessToken, refreshSession } from "./api";
import { upsertMessage } from "./messages";
import { applyPresence, manualStatus } from "./presence";
import { keys } from "./queries";
import { typingStore } from "./typing";
import { useSession } from "./session";
import { applyUser } from "./profile";
import { markNotificationsRead, refreshUnread, unreadKeys, viewing } from "./unread";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

interface RealtimeValue {
  socket: Socket | null;
  status: ConnectionStatus;
}

/** The socket lives outside React; components subscribe to it like any external store. */
let current: RealtimeValue = { socket: null, status: "connecting" };
const listeners = new Set<() => void>();
function set(next: RealtimeValue) {
  current = next;
  for (const l of listeners) l();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => current;
const serverSnapshot: RealtimeValue = { socket: null, status: "connecting" };

/**
 * One socket per signed-in tab. Server events are written straight into the query cache,
 * so every view that reads messages or nooks updates without knowing about sockets.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { state, updateUser } = useSession();
  const qc = useQueryClient();
  const userId = state.status === "authenticated" ? state.user.id : null;

  useEffect(() => {
    if (!userId) return;
    // Same origin behind nginx; in local dev Next can't proxy websockets, so point at the api directly.
    const socket = io(process.env.NEXT_PUBLIC_REALTIME_URL ?? "", {
      transports: ["websocket"],
      // A callback, so every (re)connection presents the current access token.
      auth: (cb) => cb({ token: getAccessToken() }),
    });
    let everConnected = false;
    set({ socket, status: "connecting" });

    // "ready", not "connect": the server has joined our rooms, so nothing from here on is missed.
    socket.on("session:ready", ({ status }: { status: ManualStatus }) => {
      manualStatus.set(status);
      // Anything that happened before this point never reached us over the socket: after a gap, and
      // also on the very first connection, since history may have loaded before our rooms were joined.
      // Refetch what's cached (keepLocal holds on to unsent and newer messages).
      void qc.invalidateQueries({ queryKey: ["messages"] });
      void qc.invalidateQueries({ queryKey: ["thread"] });
      if (everConnected) {
        void qc.invalidateQueries({ queryKey: ["presence"] });
        void qc.invalidateQueries({ queryKey: unreadKeys.inbox });
      }
      refreshUnread(qc);
      everConnected = true;
      set({ socket, status: "connected" });
    });
    socket.on("disconnect", () => set({ socket, status: "reconnecting" }));
    socket.on("connect_error", (err) => {
      set({ socket, status: everConnected ? "reconnecting" : "connecting" });
      // An expired access token: refresh it, and the next attempt carries the new one.
      if (err.message === "unauthorized") void refreshSession().then(() => socket.connect());
    });

    // The browser knows about lost networks long before a socket's ping times out.
    // Say so right away, and rebuild the connection as soon as the network is back.
    const onOffline = () => set({ socket, status: "reconnecting" });
    const onOnline = () => {
      socket.disconnect();
      socket.connect();
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    const onMessage = (payload: unknown): Message | null => {
      const parsed = Message.safeParse(payload);
      if (!parsed.success) return null;
      const m = parsed.data;
      upsertMessage(qc, m);
      if (m.authorId) typingStore.clear(m.channelId, m.authorId);
      return m;
    };
    // Someone else's message counts as unread, unless it lands where you're reading.
    const affectsUnread = (m: Message) =>
      m.kind === "user" && m.authorId !== userId && !m.threadRootId && viewing.channelId !== m.channelId;
    socket.on("message:new", (payload: unknown) => {
      const m = onMessage(payload);
      if (m && affectsUnread(m)) refreshUnread(qc);
    });
    socket.on("message:updated", (payload: unknown) => {
      const m = onMessage(payload);
      if (m?.deletedAt && affectsUnread(m)) refreshUnread(qc);
    });
    socket.on("notification:new", (payload: unknown) => {
      const parsed = Notification.safeParse(payload);
      if (!parsed.success) return;
      const { message } = parsed.data;
      // Already on screen: a reply in the thread you have open is read, and so is a mention in the
      // channel you're reading (reading the channel clears it on the server).
      if (message.threadRootId && viewing.threadId === message.threadRootId) {
        void markNotificationsRead({ ids: [parsed.data.id] }).catch(() => refreshUnread(qc, { inbox: true }));
        return;
      }
      if (!message.threadRootId && viewing.channelId === message.channelId) return;
      refreshUnread(qc, { inbox: true });
    });
    socket.on("user:updated", (payload: unknown) => {
      const parsed = PublicUser.safeParse(payload);
      if (!parsed.success) return;
      applyUser(qc, parsed.data);
      updateUser(parsed.data);
    });
    socket.on("unread:changed", () => refreshUnread(qc, { inbox: true }));
    socket.on("presence", ({ userId, state }: { userId: string; state: PresenceState }) => applyPresence(qc, userId, state));
    socket.on("typing", ({ channelId, userId }: { channelId: string; userId: string }) => typingStore.add(channelId, userId));

    // Idle: no input for five minutes, or the tab hidden that long. Every tab idle means "away".
    const IDLE_MS = 5 * 60_000;
    let idle = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const setIdle = (next: boolean) => {
      if (next === idle) return;
      idle = next;
      socket.emit("presence:idle", { idle });
    };
    const activity = () => {
      if (document.hidden) return;
      setIdle(false);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setIdle(true), IDLE_MS);
    };
    const onVisibility = () => {
      clearTimeout(idleTimer);
      if (document.hidden) idleTimer = setTimeout(() => setIdle(true), IDLE_MS);
      else activity();
    };
    const activityEvents = ["pointerdown", "keydown", "wheel", "pointermove"] as const;
    for (const e of activityEvents) window.addEventListener(e, activity, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    activity();
    socket.on("nook:updated", ({ slug }: { slug: string }) => {
      void qc.invalidateQueries({ queryKey: keys.nook(slug) });
      void qc.invalidateQueries({ queryKey: keys.nooks });
    });

    return () => {
      clearTimeout(idleTimer);
      for (const e of activityEvents) window.removeEventListener(e, activity);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      socket.removeAllListeners();
      socket.disconnect();
      set({ socket: null, status: "connecting" });
    };
  }, [userId, qc, updateUser]);

  return children;
}

export function useRealtime(): RealtimeValue {
  return useSyncExternalStore(subscribe, snapshot, () => serverSnapshot);
}
