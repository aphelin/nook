"use client";

import { type ManualStatus, PresenceSnapshot, type PresenceState } from "@nook/contracts";
import { type QueryClient, useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import type { Socket } from "socket.io-client";
import { api } from "./api";
import { useSession } from "./session";

export const presenceKeys = {
  nook: (slug: string) => ["presence", slug] as const,
};

export function usePresence(slug: string) {
  const signedIn = useSession().state.status === "authenticated";
  return useQuery({
    queryKey: presenceKeys.nook(slug),
    queryFn: () => api(`/nooks/${slug}/presence`, { schema: PresenceSnapshot }),
    enabled: signedIn,
    staleTime: Infinity,
  });
}

/** A live presence change patches every nook snapshot that includes the person. */
export function applyPresence(qc: QueryClient, userId: string, state: PresenceState) {
  qc.setQueriesData<PresenceSnapshot>({ queryKey: ["presence"] }, (snap) => (snap && userId in snap ? { ...snap, [userId]: state } : snap));
}

/** Your own chosen status, as the server last told us (it survives across devices). */
let manual: ManualStatus = "online";
const listeners = new Set<() => void>();
export const manualStatus = {
  set(next: ManualStatus) {
    manual = next;
    for (const l of listeners) l();
  },
};
/** Sets your status over the socket, showing it at once and rolling back if the server says no. */
export async function chooseStatus(socket: Socket | null, next: ManualStatus) {
  const previous = manual;
  manualStatus.set(next);
  const ack = (await socket
    ?.timeout(5000)
    .emitWithAck("presence:set", { state: next })
    .catch(() => null)) as { ok: boolean } | null | undefined;
  if (!ack?.ok) manualStatus.set(previous);
}

export function useManualStatus(): ManualStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => manual,
    () => "online" as const,
  );
}
