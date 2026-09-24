import Link from "next/link";
import type { Metadata } from "next";
import { StatusPage } from "@/components/brand/status-page";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <StatusPage
      code="404"
      title="Nothing at this address"
      actions={
        <>
          <Link
            href="/app"
            className="press inline-flex h-12 items-center rounded-full bg-hi px-6 text-md font-extrabold text-on-hi no-underline"
          >
            Back to your nooks
          </Link>
          <Link href="/" className="inline-flex h-12 items-center rounded-full bg-chip px-6 text-md font-bold text-on-chip no-underline">
            Nook home
          </Link>
        </>
      }
    >
      <p>The link may be mistyped, or the page has moved. Nooks you haven’t joined stay hidden until you have an invite.</p>
    </StatusPage>
  );
}
