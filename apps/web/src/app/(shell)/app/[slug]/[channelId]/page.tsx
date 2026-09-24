"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { ChannelView } from "@/components/shell/channel-view";
import { lastVisited } from "@/lib/last-visited";
import { useNookDetail } from "@/lib/queries";
import { useSession } from "@/lib/session";

export default function ChannelPage() {
  const { slug, channelId } = useParams<{ slug: string; channelId: string }>();
  const detail = useNookDetail(slug);
  const { state } = useSession();
  const channel = detail.data?.channels.find((c) => c.id === channelId);

  useEffect(() => {
    if (channel) lastVisited.remember(slug, channel.id);
  }, [slug, channel]);

  useEffect(() => {
    if (!channel) return;
    const label = channel.kind === "direct" ? channel.dmUser?.displayName : `#${channel.name}`;
    document.title = `${label} · ${detail.data?.nook.name} · Nook`;
  }, [channel, detail.data?.nook.name]);

  if (!detail.data) return null;
  if (!channel) {
    return (
      <div className="my-auto px-8">
        <h1 className="font-display text-4xl font-extrabold tracking-[-0.04em]">Channel not found</h1>
        <p className="mt-4 text-lg">It may be private, or it no longer exists.</p>
        <Link
          href={`/app/${slug}`}
          className="press mt-7 inline-flex h-12 items-center rounded-full bg-hi px-6 text-md font-extrabold text-on-hi no-underline"
        >
          Go to {detail.data.nook.name}
        </Link>
      </div>
    );
  }
  return (
    <ChannelView key={channel.id} channel={channel} detail={detail.data} meId={state.status === "authenticated" ? state.user.id : ""} />
  );
}
