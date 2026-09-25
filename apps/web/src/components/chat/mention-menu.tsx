"use client";

import type { NookMember } from "@nook/contracts";
import { type KeyboardEvent, type ReactNode, type RefObject, useId, useLayoutEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";

const MAX_SUGGESTIONS = 6;

/** The "@que" being typed right before the caret, if any. */
function queryAt(value: string, caret: number): { start: number; query: string } | null {
  const match = /(?:^|[\s(])@([A-Za-z0-9_]{0,24})$/.exec(value.slice(0, caret));
  if (!match) return null;
  return { start: caret - match[1]!.length - 1, query: match[1]!.toLowerCase() };
}

function matches(m: NookMember, q: string) {
  if (!q) return true;
  return (
    m.handle.startsWith(q) ||
    m.displayName
      .toLowerCase()
      .split(/\s+/)
      .some((w) => w.startsWith(q))
  );
}

interface MentionState {
  /** Autocomplete wiring for the textarea. */
  inputProps: {
    "aria-autocomplete": "list";
    "aria-controls": string | undefined;
    "aria-activedescendant": string | undefined;
  };
  /** Call first from the textarea's key handler; true means the menu handled the key. */
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  /** Re-reads the caret after typing, clicking or moving it. */
  sync: () => void;
  menu: ReactNode;
}

/**
 * @mention autocomplete for the composer. Type "@" and a few letters of a name or handle; arrows move,
 * Enter or Tab picks, Escape dismisses. Only people who can read the channel are offered.
 */
export function useMentionMenu(
  input: RefObject<HTMLTextAreaElement | null>,
  value: string,
  setValue: (next: string) => void,
  people: NookMember[],
): MentionState {
  const listId = useId();
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  // Escape hides the menu for this "@..." only; typing a new one brings it back.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  // Where the caret goes once the picked mention is in the box. Set in the same commit as the new
  // value, before the next key can arrive: a caret placed a frame later would land keys typed in
  // between at the end, then jump back and split the sentence around them.
  const caretAfterPick = useRef<number | null>(null);
  useLayoutEffect(() => {
    const pos = caretAfterPick.current;
    if (pos === null) return;
    caretAfterPick.current = null;
    input.current?.focus();
    input.current?.setSelectionRange(pos, pos);
  });

  const at = queryAt(value, caret);
  const options = at ? people.filter((m) => matches(m, at.query)).slice(0, MAX_SUGGESTIONS) : [];
  const open = !!at && at.start !== dismissedAt && options.length > 0;
  const index = Math.min(active, options.length - 1);
  const optionId = (i: number) => `${listId}-${i}`;

  const sync = () => {
    const el = input.current;
    if (!el) return;
    setCaret(el.selectionStart);
    const next = queryAt(el.value, el.selectionStart);
    if (!next || next.start !== at?.start || next.query !== at?.query) setActive(0);
  };

  function pick(m: NookMember) {
    if (!at) return;
    const end = at.start + 1 + at.query.length;
    const insert = `@${m.handle} `;
    const next = value.slice(0, at.start) + insert + value.slice(end);
    setValue(next);
    const pos = at.start + insert.length;
    setCaret(pos);
    caretAfterPick.current = pos;
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!open || e.nativeEvent.isComposing) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((index + step + options.length) % options.length);
      return true;
    }
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
      e.preventDefault();
      pick(options[index]!);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setDismissedAt(at.start);
      return true;
    }
    return false;
  }

  const menu = (
    <>
      <p aria-live="polite" className="sr-only">
        {open ? `${options.length} ${options.length === 1 ? "person" : "people"} to mention. Up and down to choose, Enter to pick.` : ""}
      </p>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="People to mention"
          className="surface-card absolute bottom-full left-0 z-20 mb-2 w-[min(22rem,100%)] overflow-hidden rounded-[1.5rem] p-2 shadow-float"
        >
          {options.map((m, i) => (
            <li
              key={m.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === index}
              // Keep focus in the textarea: the pick happens on mousedown, before any blur.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
              onMouseMove={() => i !== index && setActive(i)}
              className="flex h-12 cursor-pointer items-center gap-3 rounded-full px-2 aria-selected:bg-chip"
            >
              <Avatar user={m} size={26} />
              <span className="truncate text-base font-bold">{m.displayName}</span>
              <span className="truncate text-sm text-fg-2">@{m.handle}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return {
    inputProps: {
      "aria-autocomplete": "list",
      "aria-controls": open ? listId : undefined,
      "aria-activedescendant": open ? optionId(index) : undefined,
    },
    onKeyDown,
    sync,
    menu,
  };
}
