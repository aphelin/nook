"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { openingChannel } from "@/components/shell/switch-nook";
import { useNookDetail } from "@/lib/queries";

/** A nook's address opens the channel you were last in, or #general. */
export default function NookIndex() {
  const { slug } = useParams<{ slug: string }>();
  const detail = useNookDetail(slug);
  const router = useRouter();

  useEffect(() => {
    const target = detail.data && openingChannel(slug, detail.data);
    if (target) router.replace(`/app/${slug}/${target.id}`);
  }, [detail.data, slug, router]);

  return <div aria-busy="true" className="flex-1" />;
}
