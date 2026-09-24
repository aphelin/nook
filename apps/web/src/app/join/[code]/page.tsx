import type { Metadata } from "next";
import { JoinFlow } from "./join-flow";

export const metadata: Metadata = { title: "You’re invited" };

export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  return <JoinFlow code={code} />;
}
