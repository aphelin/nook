"use client";

import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { lastVisited } from "@/lib/last-visited";
import { useNooks } from "@/lib/queries";
import { useSession } from "@/lib/session";

/** Accepts a full invite URL or a bare code. */
function inviteCodeFrom(input: string): string | null {
  const trimmed = input.trim();
  const match = trimmed.match(/\/join\/([2-9a-zA-Z]{6,})\/?$/) ?? trimmed.match(/^([2-9a-zA-Z]{6,})$/);
  return match?.[1] ?? null;
}

export default function AppHome() {
  const nooks = useNooks();
  const router = useRouter();
  const { state, signOut } = useSession();
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (!nooks.data?.length) return;
    const remembered = lastVisited.nook();
    const target = nooks.data.find((n) => n.slug === remembered) ?? nooks.data[0]!;
    router.replace(`/app/${target.slug}`);
  }, [nooks.data, router]);

  function joinByLink(e: FormEvent) {
    e.preventDefault();
    const code = inviteCodeFrom(link);
    if (code) router.push(`/join/${code}`);
    else setLinkError("That doesn’t look like a Nook invite link. It should end in /join/ and a code.");
  }

  if (nooks.isPending || (nooks.data && nooks.data.length > 0)) return <div aria-busy="true" className="surface-stage h-dvh" />;

  const firstName = state.status === "authenticated" ? state.user.displayName.split(" ")[0] : "";

  return (
    <main className="surface-stage flex min-h-dvh flex-col px-5 py-6 sm:px-10 sm:py-8">
      <header className="flex items-center justify-between gap-4">
        <Wordmark href="/app" size="lg" />
        {state.status === "authenticated" && (
          <p className="flex items-center gap-3 text-base font-semibold text-fg-2">
            <span className="hidden sm:inline">Signed in as {state.user.displayName}</span>
            <Button variant="ghost" onClick={() => void signOut()}>
              Sign out
            </Button>
          </p>
        )}
      </header>
      <div className="mx-auto my-auto w-full max-w-5xl py-16">
        <h1 className="font-display text-4xl font-extrabold tracking-[-0.04em] text-balance">
          Welcome{firstName ? `, ${firstName}` : ""}. You’re not in a nook yet.
        </h1>
        <p className="mt-6 max-w-[48ch] text-xl text-pretty">Start one for your club, or join one with the invite link someone sent you.</p>
        <div className="mt-12 grid gap-10 md:grid-cols-2 md:gap-14">
          <section aria-labelledby="start-heading">
            <h2 id="start-heading" className="font-display text-2xl font-extrabold tracking-[-0.02em]">
              Start a nook
            </h2>
            <p className="mt-2 text-base text-pretty text-fg-2">Name it, pick its colours, invite your people.</p>
            <Link
              href="/app/new"
              className="tint press mt-5 inline-flex h-14 items-center gap-2.5 rounded-full bg-hi px-7 text-lg font-extrabold text-on-hi no-underline hover:scale-[1.03]"
            >
              Start a nook <ArrowRight size={22} weight="bold" aria-hidden="true" />
            </Link>
          </section>
          <section aria-labelledby="join-heading">
            <h2 id="join-heading" className="font-display text-2xl font-extrabold tracking-[-0.02em]">
              Join with a link
            </h2>
            <form onSubmit={joinByLink} className="mt-2" noValidate>
              <label htmlFor="invite-link" className="text-base text-fg-2">
                Paste the invite link you were sent.
              </label>
              <div className="mt-5 flex gap-2">
                <input
                  id="invite-link"
                  value={link}
                  onChange={(e) => {
                    setLink(e.target.value);
                    setLinkError(null);
                  }}
                  aria-invalid={!!linkError}
                  aria-describedby={linkError ? "invite-link-error" : undefined}
                  placeholder="…/join/abc123"
                  className="h-14 min-w-0 flex-1 rounded-full bg-chip px-5 text-md text-on-chip outline-none placeholder:text-[color-mix(in_oklab,var(--on-chip)_60%,transparent)] focus-visible:inset-ring-2 focus-visible:inset-ring-hi aria-[invalid=true]:inset-ring-2 aria-[invalid=true]:inset-ring-alert"
                />
                <Button type="submit" className="h-14 px-7 text-md">
                  Join
                </Button>
              </div>
              {linkError && (
                <p
                  id="invite-link-error"
                  className="field-error surface-card mt-3 w-fit rounded-field px-4 py-2.5 text-sm font-semibold text-alert"
                >
                  {linkError}
                </p>
              )}
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
