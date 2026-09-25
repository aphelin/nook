"use client";

import type { Channel } from "@nook/contracts";
import { X } from "@phosphor-icons/react/dist/ssr";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { flatten, useMessage, useMessages, useSendMessage, useThread } from "@/lib/messages";
import { useChat } from "./chat-context";
import { refreshUnread, markNotificationsRead, viewing } from "@/lib/unread";
import { useUploads } from "@/lib/uploads";
import { useTabVisible } from "@/lib/visibility";
import { useQueryClient } from "@tanstack/react-query";
import { Composer } from "./composer";
import { DropZone } from "./drop-zone";
import { MessageRow } from "./message-row";
import { toRows } from "./rows";

interface ThreadPanelProps {
  rootId: string;
  channel: Channel;
  onClose: () => void;
}

/** A thread beside the channel: the root, its replies, and a reply box. Threads are short, so no virtualization. */
export function ThreadPanel({ rootId, channel, onClose }: ThreadPanelProps) {
  const { meId, members } = useChat();
  // The panel is drawn in two passes: its head at once, with the click, so its column starts opening
  // straight away; the conversation and the reply box just after, off the click's critical path.
  const filled = useDeferredValue(true, false);
  const mentionable = useMemo(
    () => [...members.values()].filter((m) => m.id !== meId && channel.memberIds.includes(m.id)),
    [members, meId, channel.memberIds],
  );
  const channelMessages = useMessages(channel.id);
  const cachedRoot = useMemo(() => flatten(channelMessages.data).find((m) => m.id === rootId), [channelMessages.data, rootId]);
  const root = useMessage(rootId, cachedRoot);
  const rootMessage = cachedRoot ?? root.data;
  const thread = useThread(rootId);
  const replies = useMemo(() => flatten(thread.data), [thread.data]);
  const rows = useMemo(() => toRows(replies).filter((r) => r.kind === "message"), [replies]);
  const sender = useSendMessage(channel.id, rootId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const uploads = useUploads();
  const scroller = useRef<HTMLDivElement>(null);
  const label = channel.kind === "direct" ? (channel.dmUser?.displayName ?? "Direct message") : `#${channel.name}`;

  // New replies scroll into view when you're already near the bottom (or just sent one).
  const lastId = replies.at(-1)?.id;
  const stick = useRef(true);
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  const count = rootMessage?.replyCount ?? replies.length;

  // An open thread on a visible tab is being read: its notifications are cleared, and new ones for it
  // are cleared on arrival (see the realtime provider).
  const visible = useTabVisible();
  const qc = useQueryClient();
  useEffect(() => {
    if (!visible) return;
    viewing.threadId = rootId;
    void markNotificationsRead({ threadRootId: rootId }).catch(() => refreshUnread(qc, { inbox: true }));
    return () => {
      if (viewing.threadId === rootId) viewing.threadId = null;
    };
  }, [visible, rootId, qc]);

  return (
    <aside aria-labelledby="thread-heading" className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 items-start gap-3 pt-6 pr-3 pb-3 pl-6">
        <div className="min-w-0 flex-1">
          <h2 id="thread-heading" className="font-display text-2xl leading-none font-extrabold tracking-[-0.03em]">
            Thread
          </h2>
          <p className="mt-2 truncate text-sm font-semibold text-fg-2">{label}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close thread"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-chip text-on-chip transition-[scale] duration-200 ease-out-expo hover:scale-105"
        >
          <X size={20} weight="bold" aria-hidden="true" />
        </button>
      </div>

      {!filled && <div aria-busy="true" className="min-h-0 flex-1" />}
      {filled && (
        <DropZone label="Drop to reply with it" onFiles={(files) => void uploads.add(files)}>
          <div
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
            className="min-h-0 flex-1 overflow-y-auto px-1 pt-2 pb-4 md:px-3"
          >
            {rootMessage ? (
              <MessageRow
                message={rootMessage}
                grouped={false}
                inThread
                editing={editingId === rootMessage.id}
                onEditChange={(on) => setEditingId(on ? rootMessage.id : null)}
                onRetry={() => undefined}
                onDiscard={() => undefined}
              />
            ) : root.isError ? (
              <p className="px-4 py-6 text-base text-fg-2">This thread’s first message couldn’t be loaded.</p>
            ) : (
              <div aria-busy="true" className="h-20" />
            )}

            <div
              className="flex items-center gap-3 px-3 pt-5 pb-1"
              role="separator"
              aria-label={count ? `${count} ${count === 1 ? "reply" : "replies"}` : "No replies yet"}
            >
              {/* Lit when there is something to read; a thread nobody has answered yet says so quietly. */}
              <span
                className={`rounded-full px-3 py-1.5 text-xs leading-none font-extrabold ${count ? "bg-hi text-on-hi" : "bg-chip text-fg-2"}`}
                data-num
              >
                {count ? `${count} ${count === 1 ? "reply" : "replies"}` : "No replies yet"}
              </span>
              <span className="h-[2px] flex-1 rounded-full bg-line" aria-hidden="true" />
            </div>

            {thread.hasNextPage && (
              <button
                type="button"
                onClick={() => void thread.fetchNextPage()}
                className="mx-3 mt-3 rounded-full bg-chip px-4 py-2 text-sm font-bold text-on-chip"
              >
                {thread.isFetchingNextPage ? "Loading…" : "Show earlier replies"}
              </button>
            )}
            {rows.map((row) =>
              row.kind === "message" ? (
                <MessageRow
                  key={row.key}
                  message={row.message}
                  grouped={row.grouped}
                  inThread
                  editing={editingId === row.message.id}
                  onEditChange={(on) => setEditingId(on ? row.message.id : null)}
                  onRetry={() => sender.retry(row.message)}
                  onDiscard={() => sender.discard(row.message)}
                />
              ) : null,
            )}
            {thread.isPending && <div aria-busy="true" className="h-16" />}
          </div>

          <Composer
            key={`thread-${rootId}`}
            channelId={channel.id}
            draftKey={`thread:${rootId}`}
            announceTyping={false}
            placeholder="Reply…"
            uploads={uploads}
            onSend={(body, attachments) => {
              stick.current = true;
              sender.send(body, attachments);
            }}
            onEditLast={() => {
              const mine = replies.findLast((m) => m.authorId === meId && !m.deletedAt && !m.status);
              if (mine) setEditingId(mine.id);
            }}
            mentionable={mentionable}
          />
        </DropZone>
      )}
    </aside>
  );
}
