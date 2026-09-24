import type { ReactNode } from "react";
import { Wordmark } from "./wordmark";

interface StatusPageProps {
  /** The HTTP status, shown as a footnote: "404", "500". */
  code: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
}

/**
 * Pages for when something isn't where it should be.
 *
 * The same drenched colour as the app, with the apology said loud: a short line at poster size is
 * what stops it floating alone in a 1440x900 field. The status code is a footnote under the way
 * out rather than a label above the heading: whoever needs the number is writing a bug report, and
 * nobody arriving here reads it first.
 */
export function StatusPage({ code, title, children, actions }: StatusPageProps) {
  return (
    <div className="surface-stage flex min-h-dvh flex-col px-6 py-8 sm:px-12 md:py-10">
      <Wordmark href="/" size="lg" />
      <main className="my-auto w-full max-w-5xl self-center py-12">
        <h1 className="max-w-[16ch] font-display text-4xl font-extrabold tracking-[-0.04em] text-balance">{title}</h1>
        <div className="mt-6 max-w-[46ch] text-xl text-pretty">{children}</div>
        <div className="mt-9 flex flex-wrap items-center gap-3">{actions}</div>
        <p className="mt-10 text-sm font-semibold text-fg-2" data-num>
          Status {code}
        </p>
      </main>
    </div>
  );
}
