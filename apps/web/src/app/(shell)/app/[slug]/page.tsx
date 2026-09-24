"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { lastVisited } from "@/lib/last-visited";
import { useNookDetail } from "@/lib/queries";

/** A nook's address opens the channel you were last in, or #general. */
export default function NookIndex() {
  const { slug } = useParams<{ slug: string }>();
  const detail = useNookDetail(slug);
  const router = useRouter();

  useEffect(() => {
    const channels = detail.data?.channels;
    if (!channels?.length) return;
    const remembered = lastVisited.channel(slug);
    const target = channels.find((c) => c.id === remembered) ?? channels.find((c) => c.name === "general") ?? channels[0]!;
    router.replace(`/app/${slug}/${target.id}`);
  }, [detail.data, slug, router]);

  return <div aria-busy="true" className="flex-1" />;
}
