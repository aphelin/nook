"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { NookDisc } from "@/components/brand/nook-disc";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { ApiRequestError } from "@/lib/api";
import { useAcceptInvite, useInvitePreview } from "@/lib/queries";
import { useSession } from "@/lib/session";

const STATUS_COPY = {
  expired: "This invite has expired.",
  used_up: "This invite has been used up.",
  revoked: "This invite was turned off.",
} as const;

export function JoinFlow({ code }: { code: string }) {
  const preview = useInvitePreview(code);
  const accept = useAcceptInvite();
  const { state } = useSession();
  const router = useRouter();
  const [alert, setAlert] = useState<string | null>(null);
  const next = encodeURIComponent(`/join/${code}`);

  async function join() {
    setAlert(null);
    try {
      const nook = await accept.mutateAsync(code);
      router.push(`/app/${nook.slug}`);
    } catch (err) {
      setAlert(err instanceof ApiRequestError ? err.message : "Couldn’t reach Nook. Check your connection and try again.");
    }
  }

  if (preview.isPending) return <div aria-busy="true" className="h-dvh bg-bg" />;

  if (!preview.data) {
    return (
      <AuthShell compactPanelOnMobile panel={null}>
        <h1 className="font-display text-3xl leading-none font-extrabold tracking-[-0.03em]">Invite not found</h1>
        <p className="mt-3 text-lg text-pretty text-fg-2">
          {preview.error instanceof ApiRequestError ? preview.error.message : "Couldn’t load this invite. Check your connection."}
        </p>
        <Link
          href="/app"
          className="press mt-8 inline-flex h-12 items-center rounded-full bg-hi px-6 text-md font-extrabold text-on-hi no-underline"
        >
          Go to your nooks
        </Link>
      </AuthShell>
    );
  }

  const { nook, invitedBy, status } = preview.data;
  const valid = status === "valid";

  return (
    <AuthShell
      kit={nook.kit}
      panel={
        <div className="flex w-full max-w-[30rem] flex-col items-center text-center lg:items-start lg:text-left">
          <span className="pop-in rounded-full p-1.5 ring-[3px] ring-fg">
            <NookDisc kit={nook.kit} initial={nook.name[0]} size={104} />
          </span>
          <p className="mt-7 font-display text-4xl font-extrabold tracking-[-0.04em] text-balance">{nook.name}</p>
          {nook.description && <p className="mt-4 max-w-[36ch] text-xl text-pretty">{nook.description}</p>}
          <p className="mt-5 w-fit rounded-full bg-hi px-4 py-2 text-base font-extrabold text-on-hi" data-num>
            {nook.memberCount} {nook.memberCount === 1 ? "member" : "members"}
          </p>
        </div>
      }
    >
      <h1 className="font-display text-3xl leading-none font-extrabold tracking-[-0.03em] text-balance">
        {valid ? `Join ${nook.name}` : STATUS_COPY[status]}
      </h1>
      <p className="mt-4 text-lg text-pretty text-fg-2">
        {valid
          ? `${invitedBy.displayName} invited you. You’ll see its channels and people as soon as you’re in.`
          : `Ask ${invitedBy.displayName} or someone else in ${nook.name} for a fresh link.`}
      </p>

      <div className="mt-9 flex flex-col gap-4">
        <FormAlert message={alert} />
        {!valid ? (
          <Link
            href="/app"
            className="press inline-flex h-12 w-fit items-center rounded-full bg-hi px-6 text-md font-extrabold text-on-hi no-underline"
          >
            Go to your nooks
          </Link>
        ) : state.status === "authenticated" ? (
          <>
            <Button pending={accept.isPending} pendingLabel="Joining…" className="h-13 w-full text-md" onClick={() => void join()}>
              Join {nook.name}
            </Button>
            <p className="text-base text-fg-2">Joining as {state.user.displayName}.</p>
          </>
        ) : state.status === "anonymous" ? (
          <>
            <Link
              href={`/signup?next=${next}`}
              className="tint press inline-flex h-13 w-full items-center justify-center rounded-full bg-hi px-6 text-md font-extrabold text-on-hi no-underline hover:brightness-110"
            >
              Create an account to join
            </Link>
            <p className="text-base text-fg-2">
              Already on Nook?{" "}
              <Link href={`/login?next=${next}`} className="font-extrabold text-fg underline decoration-2 underline-offset-4">
                Sign in
              </Link>
            </p>
          </>
        ) : null}
      </div>
    </AuthShell>
  );
}
