"use client";

import { type Attachment, MESSAGE_MAX_LENGTH, type NookMember, UPLOAD_TYPES } from "@nook/contracts";
import { ArrowUp, Paperclip } from "@phosphor-icons/react/dist/ssr";
import { type FormEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { reducedMotion } from "@/lib/motion";
import { useRealtime } from "@/lib/realtime";
import { optimisticAttachment, type Uploads } from "@/lib/uploads";
import { useMentionMenu } from "./mention-menu";
import { UploadChips } from "./upload-chips";

const ACCEPT = Object.keys(UPLOAD_TYPES).join(",");

const draftKey = (channelId: string) => `nook:draft:${channelId}`;
const readDraft = (channelId: string) => {
  try {
    return localStorage.getItem(draftKey(channelId)) ?? "";
  } catch {
    return "";
  }
};
const writeDraft = (channelId: string, value: string) => {
  try {
    if (value) localStorage.setItem(draftKey(channelId), value);
    else localStorage.removeItem(draftKey(channelId));
  } catch {
    // Drafts are a convenience; without storage they simply don't survive a reload.
  }
};

interface ComposerProps {
  channelId: string;
  /** Where the draft is kept; a thread keeps its own. Defaults to the channel. */
  draftKey?: string;
  /** Whether typing signals go to the channel (off in threads). */
  announceTyping?: boolean;
  placeholder: string;
  /** Files being attached to this message, shared with the drop zone around the conversation. */
  uploads: Uploads;
  onSend: (body: string, attachments: Attachment[]) => void;
  /** Up arrow in an empty composer edits your last message. */
  onEditLast: () => void;
  /** Who "@" offers: the people who can read this channel, you excluded. */
  mentionable: NookMember[];
}

/** Sent: the arrow leaves through the top of its disc and a fresh one rises into place. */
function launch(el: HTMLElement | null) {
  if (!el || reducedMotion()) return;
  el.animate(
    [
      { transform: "translateY(0)", opacity: 1 },
      { transform: "translateY(-130%)", opacity: 0, offset: 0.42 },
      { transform: "translateY(130%)", opacity: 0, offset: 0.43 },
      { transform: "translateY(0)", opacity: 1 },
    ],
    { duration: 440, easing: getComputedStyle(document.documentElement).getPropertyValue("--ease").trim() || "ease-out" },
  );
}

export function Composer({
  channelId,
  draftKey = channelId,
  announceTyping = true,
  placeholder,
  uploads,
  onSend,
  onEditLast,
  mentionable,
}: ComposerProps) {
  const [value, setValue] = useState(() => readDraft(draftKey));
  const input = useRef<HTMLTextAreaElement>(null);
  const sendIcon = useRef<HTMLSpanElement>(null);
  const mention = useMentionMenu(input, value, setValue, mentionable);
  const { socket } = useRealtime();
  const lastTyping = useRef(0);

  // Tell the channel you're typing, at most every couple of seconds.
  function signalTyping(next: string) {
    if (!announceTyping || !next.trim() || !socket?.connected) return;
    const now = Date.now();
    if (now - lastTyping.current < 2500) return;
    lastTyping.current = now;
    socket.emit("typing:start", { channelId });
  }
  const hintId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const trimmed = value.trim();
  const over = value.length > MESSAGE_MAX_LENGTH;
  const ready = uploads.items.filter((u) => u.status === "ready");
  const canSend = !over && !uploads.uploading && !uploads.hasErrors && (trimmed.length > 0 || ready.length > 0);

  useEffect(() => writeDraft(draftKey, value), [draftKey, value]);

  // Grow with the text, up to a cap; then scroll inside.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
  }, [value]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!canSend) return;
    onSend(trimmed, ready.map(optimisticAttachment));
    launch(sendIcon.current);
    uploads.clear();
    setValue("");
    lastTyping.current = 0;
    input.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing || mention.onKeyDown(e)) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === "ArrowUp" && value === "") {
      e.preventDefault();
      onEditLast();
    }
  }

  return (
    /*
     * The composer is a card lifted off the colour, a big round pill docked at the foot of the room.
     * Focus rings it in the card's highlight; the send button is a solid disc of the club's other
     * colour that stays dim until there is something to send.
     */
    <form onSubmit={submit} className="shrink-0 px-3 pb-3 md:px-6 md:pb-5">
      <div className="surface-card tint relative rounded-[1.75rem] shadow-card transition-[box-shadow] duration-150 has-[textarea:focus-visible]:inset-ring-2 has-[textarea:focus-visible]:inset-ring-hi">
        {mention.menu}
        <UploadChips uploads={uploads} />
        <div className="flex items-end gap-1.5 p-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              if (e.target.files?.length) void uploads.add(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            aria-label="Attach files"
            className="grid size-10 shrink-0 place-items-center rounded-full text-fg-2 transition-colors duration-150 hover:bg-chip hover:text-fg"
          >
            <Paperclip size={20} weight="bold" aria-hidden="true" />
          </button>
          <textarea
            ref={input}
            rows={1}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              signalTyping(e.target.value);
            }}
            onKeyDown={onKeyDown}
            onSelect={mention.sync}
            {...mention.inputProps}
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault();
                void uploads.add(e.clipboardData.files);
              }
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            aria-describedby={hintId}
            aria-invalid={over || undefined}
            className="max-h-[40vh] min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-md leading-normal outline-none placeholder:text-fg-2"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label={uploads.uploading ? "Uploading, send when done" : "Send message"}
            className="tint press grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-hi text-on-hi hover:scale-105 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:[&>svg]:opacity-45"
          >
            <span ref={sendIcon} className="grid place-items-center">
              <ArrowUp size={20} weight="bold" aria-hidden="true" />
            </span>
          </button>
        </div>
      </div>
      {uploads.notice && (
        <p role="alert" className="field-error surface-card mt-2 w-fit rounded-full px-3.5 py-1.5 text-sm font-semibold text-alert">
          {uploads.notice}
        </p>
      )}
      <p
        id={hintId}
        data-num
        className={over ? "surface-card mt-2 w-fit rounded-full px-3.5 py-1.5 text-sm font-semibold text-alert" : "sr-only"}
      >
        {over
          ? `${value.length - MESSAGE_MAX_LENGTH} characters over the limit.`
          : "Enter to send, Shift and Enter for a new line, Up arrow to edit your last message, @ to mention someone."}
      </p>
    </form>
  );
}
