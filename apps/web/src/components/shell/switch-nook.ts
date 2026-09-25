"use client";

import type { Channel, Kit, NookDetail } from "@nook/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { lastVisited } from "@/lib/last-visited";
import { prefetchHistory } from "@/lib/messages";
import { nookDetailQuery } from "@/lib/queries";
import { shownNook, turn } from "./story-turn";

/** Where a nook opens: the channel you were last in there, or #general, or its first. */
export function openingChannel(slug: string, detail: NookDetail): Channel | undefined {
  const { channels } = detail;
  const remembered = lastVisited.channel(slug);
  return channels.find((c) => c.id === remembered) ?? channels.find((c) => c.name === "general") ?? channels[0];
}

/** Whichever comes first: the promise, or `ms` going by (then undefined). Never rejects. */
const within = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<undefined>((resolve) => window.setTimeout(() => resolve(undefined), ms))]).catch(() => undefined);

/**
 * Moving to another nook, and getting it ready before you do.
 *
 * Pointing at a nook loads what it opens on (its channels, the channel you will land in and that
 * channel's latest messages) and warms the route. Going there pours the club's colour over the
 * screen (story-turn), and the pour only starts once the new room is drawn with its conversation:
 * the screen you are leaving holds still meanwhile, never for longer than a moment, and nothing heavy
 * is left to run on the main thread while the paint is moving.
 */
export function useSwitchNook() {
  const qc = useQueryClient();
  const router = useRouter();

  const ready = useCallback(
    async (slug: string) => {
      const detail = await qc.ensureQueryData(nookDetailQuery(slug));
      const channel = openingChannel(slug, detail);
      if (channel) await prefetchHistory(qc, channel.id);
      return channel;
    },
    [qc],
  );

  const prefetch = useCallback(
    (slug: string) => {
      void ready(slug)
        .then((channel) => channel && router.prefetch(`/app/${slug}/${channel.id}`))
        .catch(() => undefined);
    },
    [ready, router],
  );

  const go = useCallback(
    (nook: { slug: string; kit: Kit }, before?: () => void) =>
      turn(nook.kit, async () => {
        before?.();
        const channel = await within(ready(nook.slug), 600);
        router.push(channel ? `/app/${nook.slug}/${channel.id}` : `/app/${nook.slug}`);
        await shownNook(nook.slug);
      }),
    [ready, router],
  );

  return { prefetch, go };
}
