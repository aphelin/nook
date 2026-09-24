"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import type { SystemEvent } from "@nook/contracts";
import { ArrowClockwise, ChatCircleText, PencilSimple, Smiley, Trash, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { type KeyboardEvent, useState } from "react";
import { PersonTrigger, StatusEmoji } from "@/components/people/person-card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatMessage, type RenderMention } from "@/lib/format";
import { type ClientMessage, useDeleteMessage, useEditMessage, useToggleReaction } from "@/lib/messages";
import { Attachments } from "./attachments";
import { useChat } from "./chat-context";
import { LinkPreviews } from "./link-preview";
import { EmojiPicker } from "./emoji-picker";
import { ReactionBar } from "./reactions";
import { ThreadSummary } from "./thread-summary";

const SYSTEM_LINE: Record<SystemEvent, string> = {
  member_joined: "joined the nook",
  channel_created: "opened the channel",
};

const timeFormat = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" });
const fullFormat = new Intl.DateTimeFormat("en", { dateStyle: "full", timeStyle: "short" });

interface MessageRowProps {
  message: ClientMessage;
  grouped: boolean;
  /** Inside the thread panel: no thread summary, no "reply in thread". */
  inThread?: boolean;
  editing: boolean;
  onEditChange: (editing: boolean) => void;
  onRetry: () => void;
  onDiscard: () => void;
}

function Time({ iso, className = "" }: { iso: string; className?: string }) {
  const d = new Date(iso);
  return (
    <time dateTime={iso} title={fullFormat.format(d)} className={`text-xs font-medium text-fg-2 ${className}`}>
      {timeFormat.format(d)}
    </time>
  );
}

const actionButton = "grid size-8 place-items-center rounded-full text-fg-2 transition-colors hover:bg-chip hover:text-fg";

function EditBox({ message, onDone }: { message: ClientMessage; onDone: () => void }) {
  const [value, setValue] = useState(message.body);
  const edit = useEditMessage();
  const save = () => {
    const body = value.trim();
    if (!body || body === message.body) return onDone();
    edit.mutate({ id: message.id, body }, { onSuccess: onDone });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") onDone();
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      save();
    }
  };
  return (
    <div className="w-full max-w-[40rem]">
      <textarea
        autoFocus
        aria-label="Edit message"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
        rows={Math.min(8, value.split("\n").length)}
        className="surface-card w-full resize-none rounded-field px-4 py-3 text-base leading-relaxed outline-none inset-ring-2 inset-ring-hi"
      />
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 px-1 text-xs font-semibold text-fg-2">
        <span>Enter to save · Esc to cancel</span>
        {edit.isError && <span className="text-fg">Couldn’t save. Try again.</span>}
      </p>
    </div>
  );
}

/**
 * One message.
 *
 * Talk is set straight onto the club's colour, with no bubble: the room is the colour and the words
 * sit in it, all on one left edge so a long channel stays scannable. Consecutive messages from one
 * person share their shape and name, so a run of six lines costs one person rather than six.
 *
 * Only what is about you is lifted off the colour onto a card: a message that mentions you, and a
 * message of yours that didn't send. Reactions are pills under the message carrying the shapes of
 * who reacted, so who agreed with what is on screen instead of behind a hover.
 */
export function MessageRow({ message, grouped, inThread = false, editing, onEditChange, onRetry, onDiscard }: MessageRowProps) {
  const { members, meId, openThread, resolveMention, slug } = useChat();
  // A mention chip opens that person's card, like their name does.
  const renderMention: RenderMention = (who, text, className) => {
    const person = members.get(who.id);
    if (!person)
      return (
        <span title={who.name} className={className}>
          {text}
        </span>
      );
    return (
      <PersonTrigger
        person={person}
        slug={slug}
        meId={meId}
        side="top"
        label={`${text}, ${who.name}`}
        render={<button type="button" title={who.name} className={`${className} cursor-pointer`} />}
      >
        {text}
      </PersonTrigger>
    );
  };
  const author = message.authorId ? members.get(message.authorId) : undefined;
  const isMine = message.authorId === meId;
  const remove = useDeleteMessage();
  const react = useToggleReaction();
  const name = author?.displayName ?? "Former member";
  const pending = message.status === "sending";
  const failed = message.status === "failed";
  const mentionsMe = message.mentions.includes(meId);
  const hasReactions = message.reactions.length > 0 && !message.deletedAt && !editing;

  // Joins and channel openings are the room's own voice: centred, quiet, in a pill of the room's tone.
  if (message.kind === "system") {
    return (
      <div className="flex justify-center py-2.5">
        <div className="inline-flex items-center gap-2 rounded-full bg-hover py-1 pr-3.5 pl-1.5">
          {author && <Avatar user={author} size={22} />}
          <p className="text-sm leading-none">
            <span className="font-bold">{name}</span> {SYSTEM_LINE[message.body as SystemEvent] ?? "was here"}
          </p>
          <Time iso={message.createdAt} />
        </div>
      </div>
    );
  }

  return (
    <article
      aria-label={`${name}, ${timeFormat.format(new Date(message.createdAt))}`}
      data-mentions-me={mentionsMe || undefined}
      data-message-id={message.id}
      className={`group relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 rounded-[1.25rem] px-2 pb-1 transition-colors duration-100 hover:bg-hover has-[[data-popup-open]]:bg-hover ${
        grouped ? "pt-1" : "pt-2.5"
      }`}
    >
      {/* The gutter: the author's shape at the top of their run; the time of a continuation on hover. */}
      <div className="flex justify-center">
        {!grouped && author ? (
          <PersonTrigger
            person={author}
            slug={slug}
            meId={meId}
            render={
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                className="block h-fit rounded-full transition-[scale] duration-200 ease-out-expo hover:scale-105"
              />
            }
          >
            <Avatar user={author} size={44} />
          </PersonTrigger>
        ) : grouped && !editing ? (
          <Time
            iso={message.createdAt}
            className="pointer-events-none pt-1 text-[0.6875rem] opacity-0 transition-opacity group-hover:opacity-100"
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col items-start">
        {!grouped && (
          <header className="mb-0.5 flex items-baseline gap-2">
            <h3 className="flex min-w-0 items-baseline gap-1.5 text-base font-extrabold">
              {author ? (
                <PersonTrigger
                  person={author}
                  slug={slug}
                  meId={meId}
                  render={<button type="button" className="min-w-0 truncate rounded-chip text-left hover:underline" />}
                >
                  {name}
                </PersonTrigger>
              ) : (
                <span className="truncate">{name}</span>
              )}
              {author && <StatusEmoji user={author} />}
            </h3>
            <Time iso={message.createdAt} />
          </header>
        )}

        {editing ? (
          <EditBox message={message} onDone={() => onEditChange(false)} />
        ) : (
          <div
            className={`relative max-w-[min(68ch,100%)] ${
              mentionsMe || failed
                ? // Lifted onto a card; inside a card already (a thread), onto the card's own chip.
                  `${inThread ? "bg-chip" : "surface-card tint shadow-card"} mt-1 w-fit rounded-field px-4 py-2.5`
                : "w-full"
            }`}
          >
            {message.deletedAt ? (
              <p className="text-base text-fg-2 italic">Message deleted</p>
            ) : (
              <>
                {message.body && (
                  <div className={`text-base break-words whitespace-pre-wrap ${pending ? "text-fg-2" : ""}`}>
                    {formatMessage(message.body, resolveMention, renderMention)}
                    {message.editedAt && <span className="ml-1.5 text-xs font-medium text-fg-2">(edited)</span>}
                  </div>
                )}
                <Attachments items={message.attachments} />
                <LinkPreviews items={message.linkPreviews} />
              </>
            )}
            {failed && (
              <p
                role="status"
                className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-sm font-semibold text-alert"
              >
                <span className="inline-flex items-center gap-1.5">
                  <WarningCircle size={16} weight="bold" aria-hidden="true" /> Didn’t send.
                </span>
                <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 text-fg underline underline-offset-4">
                  <ArrowClockwise size={14} weight="bold" aria-hidden="true" /> Retry
                </button>
                <button type="button" onClick={onDiscard} className="text-fg-2 underline underline-offset-4">
                  Discard
                </button>
              </p>
            )}
          </div>
        )}

        {hasReactions && <ReactionBar message={message} />}
        {!inThread && !message.deletedAt && !editing && <ThreadSummary message={message} />}
      </div>

      {!message.deletedAt && !message.status && !editing && (
        <div className="surface-card absolute -top-4 right-3 z-20 hidden gap-0.5 rounded-full p-1 shadow-card group-focus-within:flex group-hover:flex has-[[data-popup-open]]:flex">
          <EmojiPicker
            triggerLabel="Add a reaction"
            onPick={(emoji) => react.mutate({ message, emoji, add: true })}
            trigger={<button type="button" className={actionButton} />}
            triggerContent={<Smiley size={17} weight="bold" aria-hidden="true" />}
          />
          {!inThread && !message.threadRootId && (
            <button type="button" aria-label="Reply in thread" className={actionButton} onClick={() => openThread(message.id)}>
              <ChatCircleText size={17} weight="bold" aria-hidden="true" />
            </button>
          )}
          {isMine && (
            <>
              <button type="button" aria-label="Edit message" className={actionButton} onClick={() => onEditChange(true)}>
                <PencilSimple size={17} weight="bold" aria-hidden="true" />
              </button>
              <AlertDialog.Root>
                <AlertDialog.Trigger aria-label="Delete message" className={actionButton}>
                  <Trash size={17} weight="bold" aria-hidden="true" />
                </AlertDialog.Trigger>
                <AlertDialog.Portal>
                  <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
                  <AlertDialog.Popup className="surface-card fixed top-1/2 left-1/2 z-50 w-[min(27rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-card p-7 shadow-float outline-none transition-[opacity,scale] duration-200 ease-out-expo data-[ending-style]:scale-90 data-[ending-style]:opacity-0 data-[starting-style]:scale-90 data-[starting-style]:opacity-0">
                    <AlertDialog.Title className="font-display text-2xl leading-none font-extrabold tracking-[-0.03em]">
                      Delete message?
                    </AlertDialog.Title>
                    <AlertDialog.Description className="mt-3 text-base text-pretty text-fg-2">
                      Everyone in the channel will see that a message was deleted. This can’t be undone.
                    </AlertDialog.Description>
                    <div className="mt-7 flex justify-end gap-2">
                      <AlertDialog.Close render={<Button variant="ghost" />}>Keep it</AlertDialog.Close>
                      <AlertDialog.Close render={<Button variant="danger" />} onClick={() => remove.mutate(message)}>
                        Delete
                      </AlertDialog.Close>
                    </div>
                  </AlertDialog.Popup>
                </AlertDialog.Portal>
              </AlertDialog.Root>
            </>
          )}
        </div>
      )}
    </article>
  );
}
