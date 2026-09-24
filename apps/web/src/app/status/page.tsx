import type { Metadata } from "next";
import { connection } from "next/server";
import { Wordmark } from "@/components/brand/wordmark";
import { getHealth } from "@/lib/server-api";

export const metadata: Metadata = { title: "Status", robots: { index: false } };

function Row({ term, value, ok }: { term: string; value: string; ok: boolean }) {
  return (
    <>
      <dt className="text-base font-bold text-fg-2">{term}</dt>
      <dd className="flex items-center gap-2.5 text-base font-semibold text-fg" data-testid={term === "API" ? "api-status" : undefined}>
        <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${ok ? "bg-hi" : "bg-alert"}`} />
        {value}
      </dd>
    </>
  );
}

/** Which api replica answered, and whether its database and Redis are up: for operators and the stack check. */
export default async function Status() {
  await connection();
  const health = await getHealth();

  return (
    <main className="surface-stage flex min-h-dvh flex-col px-6 py-8 sm:px-12">
      <Wordmark href="/" size="lg" />
      <div className="my-auto w-full max-w-xl">
        <h1 className="font-display text-4xl font-extrabold tracking-[-0.04em]">Status</h1>
        <dl className="surface-card mt-8 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-8 gap-y-4 rounded-card p-7 shadow-card">
          <Row term="API" value={health ? `ok · ${health.instance}` : "unreachable"} ok={!!health} />
          <Row term="Database" value={health?.checks.database ?? "unknown"} ok={health?.checks.database === "up"} />
          <Row term="Redis" value={health?.checks.redis ?? "unknown"} ok={health?.checks.redis === "up"} />
        </dl>
      </div>
    </main>
  );
}
