"use client";

import Link from "next/link";
import { useEffect } from "react";
import { StatusPage } from "@/components/brand/status-page";

/** Anything that breaks while rendering a page lands here, with a way to try again. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StatusPage
      code="500"
      title="Something went wrong"
      actions={
        <>
          <button
            type="button"
            onClick={() => retry()}
            className="press inline-flex h-12 items-center rounded-full bg-hi px-6 text-md font-extrabold text-on-hi no-underline"
          >
            Try again
          </button>
          <Link href="/app" className="inline-flex h-12 items-center rounded-full bg-chip px-6 text-md font-bold text-on-chip no-underline">
            Back to your nooks
          </Link>
        </>
      }
    >
      <p>This page hit an error it couldn’t recover from. Your messages are safe; trying again usually sorts it out.</p>
      {error.digest && <p className="mt-3 text-sm">Reference: {error.digest}</p>}
    </StatusPage>
  );
}
