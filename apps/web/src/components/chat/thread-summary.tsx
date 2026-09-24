"use client";

import type { Message } from "@nook/contracts";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import { Avatar } from "@/components/ui/avatar";
import { useChat } from "./chat-context";

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function ago(iso: string) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (minutes > -1) return "just now";
  if (minutes > -60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours > -24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

/**
 * "3 replies · last reply 5 minutes ago" under a thread root.
 *
 * It sits below the message as its own pill, because a thread is a different place, not part of
 * the message. The open thread's pill is the room's highlight, so the transcript says which
 * conversation the card beside it is showing.
 */
export function ThreadSummary({ message }: { message: Message }) {
  const { members, activeThreadId, openThread } = useChat();
  if (message.replyCount === 0) return null;
  const active = activeThreadId === message.id;
  return (
    <button
      type="button"
      onClick={() => openThread(message.id)}
      aria-current={active ? "true" : undefined}
      className={`tint mt-1.5 inline-flex max-w-full items-center gap-2 rounded-full py-1 pr-3 pl-1.5 text-left text-sm ${
        active
          ? "bg-hi text-on-hi [--face-1:var(--on-hi)] [--face-2:var(--on-hi)] [--face-3:var(--on-hi)] [--on-face-1:var(--hi)] [--on-face-2:var(--hi)] [--on-face-3:var(--hi)]"
          : "bg-hover hover:bg-hover-strong"
      }`}
    >
      <span className="flex -space-x-1" aria-hidden="true">
        {message.replyAuthorIds.map((id) => {
          const m = members.get(id);
          return m ? <Avatar key={id} user={m} size={22} /> : null;
        })}
      </span>
      <span className="font-extrabold">
        {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
      </span>
      {message.lastReplyAt && (
        <span className={`truncate font-medium ${active ? "" : "text-fg-2"}`}>Last reply {ago(message.lastReplyAt)}</span>
      )}
      <CaretRight size={12} weight="bold" aria-hidden="true" className="shrink-0" />
    </button>
  );
}
