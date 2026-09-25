"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { ApiRequestError } from "./api";
import { useSession } from "./session";

const makeClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // 4xx answers are final; only retry what might be transient.
        retry: (count, err) => !(err instanceof ApiRequestError && err.status < 500) && count < 2,
      },
    },
  });

/**
 * Every signed-in person gets a cache of their own. The query keys say what the data is (`nooks`,
 * `nook/<slug>`), not whose it is, so a cache kept across a sign-out and a new sign-up or sign-in
 * would show the next person the last one's nooks until a refetch landed. A change of person
 * swaps in an empty client in the same render, before anything below reads from it.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const { state } = useSession();
  const owner = state.status === "authenticated" ? state.user.id : null;
  const [held, setHeld] = useState(() => ({ owner, client: makeClient() }));
  if (held.owner !== owner) setHeld({ owner, client: makeClient() });
  useEffect(() => () => held.client.clear(), [held]);
  return <QueryClientProvider client={held.client}>{children}</QueryClientProvider>;
}
