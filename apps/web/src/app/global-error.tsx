"use client";

import { StatusPage } from "@/components/brand/status-page";
import "./globals.css";

/** When the root layout itself fails: this replaces the whole document, so it brings its own html, body and styles. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <title>Something went wrong · Nook</title>
        <StatusPage
          code="500"
          title="Something went wrong"
          actions={
            <button
              type="button"
              onClick={() => retry()}
              className="press inline-flex h-12 items-center rounded-full bg-hi px-6 text-md font-extrabold text-on-hi no-underline"
            >
              Try again
            </button>
          }
        >
          <p>Nook couldn’t start this page. Trying again usually sorts it out.</p>
          {error.digest && <p className="mt-3 text-sm">Reference: {error.digest}</p>}
        </StatusPage>
      </body>
    </html>
  );
}
