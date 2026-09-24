"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";

/** Only same-site paths are honoured, so `?next=` can't bounce people to another site. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}

/** Sends already-signed-in visitors on to where they were going. */
export function useRedirectWhenSignedIn() {
  const { state } = useSession();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  useEffect(() => {
    if (state.status === "authenticated") router.replace(next);
  }, [state.status, next, router]);
  return next;
}
