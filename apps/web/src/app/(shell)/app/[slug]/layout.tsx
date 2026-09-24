"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { NookRail } from "@/components/shell/nook-rail";
import { ShellFrame } from "@/components/shell/shell-frame";
import { ApiRequestError } from "@/lib/api";
import { ShellSkeleton } from "@/components/shell/shell-skeleton";
import { useNookDetail, useNooks } from "@/lib/queries";
import { useSession } from "@/lib/session";

export default function NookLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ slug: string; channelId?: string }>();
  const detail = useNookDetail(params.slug);
  const known = useNooks().data?.find((n) => n.slug === params.slug);
  const { state } = useSession();
  const meId = state.status === "authenticated" ? state.user.id : "";

  if (detail.data) {
    return (
      <ShellFrame detail={detail.data} activeChannelId={params.channelId ?? null} meId={meId}>
        {children}
      </ShellFrame>
    );
  }

  if (detail.error) {
    const missing = detail.error instanceof ApiRequestError && detail.error.status === 404;
    return (
      <div className="surface-stage grid h-dvh grid-cols-[minmax(0,1fr)] md:grid-cols-[76px_minmax(0,1fr)]">
        <div className="hidden md:block">
          <NookRail activeSlug={null} />
        </div>
        <main className="flex flex-col px-6 py-8 sm:px-10">
          <Wordmark href="/app" className="md:hidden" />
          <div className="my-auto max-w-[52ch]">
            <h1 className="font-display text-4xl font-extrabold tracking-[-0.04em] text-balance">
              {missing ? "No nook here" : "Couldn’t load this nook"}
            </h1>
            <p className="mt-5 text-lg text-pretty">
              {missing
                ? "It may have a different address, or you might need an invite to join it."
                : "Check your connection and try again."}
            </p>
            {missing ? (
              <Link
                href="/app"
                className="press mt-8 inline-flex h-12 items-center rounded-full bg-hi px-6 text-md font-extrabold text-on-hi no-underline"
              >
                Back to your nooks
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => void detail.refetch()}
                className="press mt-8 inline-flex h-12 items-center rounded-full bg-hi px-6 text-md font-extrabold text-on-hi"
              >
                Try again
              </button>
            )}
          </div>
        </main>
      </div>
    );
  }

  return <ShellSkeleton kit={known?.kit} name={known?.name} />;
}
