import { Fragment, type ReactNode } from "react";

/** Who an @handle refers to, if anyone in the nook. */
export type ResolveMention = (handle: string) => { id: string; name: string; isMe: boolean } | null;
/** Draws a resolved mention chip, e.g. as a button that opens the person's card. */
export type RenderMention = (who: { id: string; name: string; isMe: boolean }, text: string, className: string) => ReactNode;

/**
 * Renders message text as React nodes: never HTML, so nothing a user types can inject markup.
 * Supports ```code blocks```, `inline code`, **bold**, _italic_, bare http(s) links and @mentions.
 */
export function formatMessage(text: string, resolveMention?: ResolveMention, renderMention?: RenderMention): ReactNode {
  const blocks = text.split(/```(?:[a-z0-9+-]*\n)?([\s\S]*?)```/g);
  return blocks.map((part, i) =>
    i % 2 === 1 ? (
      <pre key={i} className="my-1.5 overflow-x-auto rounded-field bg-hover px-4 py-3 font-mono text-sm leading-relaxed whitespace-pre">
        <code>{part.replace(/\n$/, "")}</code>
      </pre>
    ) : (
      <Fragment key={i}>{inline(part, resolveMention, renderMention)}</Fragment>
    ),
  );
}

// Same mention rule as the server's (see MENTION in the contracts): not after a word or another @.
const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(_[^_\n]+_)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'")\]])|((?<![\w@])@[A-Za-z0-9_]{2,24}(?![\w]))/g;

function inline(text: string, resolveMention?: ResolveMention, renderMention?: RenderMention): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const [token, code, bold, italic, url, mention] = m;
    const key = `${at}-${token.length}`;
    if (code) {
      out.push(
        <code key={key} className="rounded-[6px] bg-hover-strong px-1 py-0.5 font-mono text-[0.875em]">
          {code.slice(1, -1)}
        </code>,
      );
    } else if (bold) {
      out.push(<strong key={key}>{bold.slice(2, -2)}</strong>);
    } else if (italic) {
      out.push(<em key={key}>{italic.slice(1, -1)}</em>);
    } else if (mention) {
      const who = resolveMention?.(mention.slice(1).toLowerCase());
      const chip = `rounded-full px-[0.4em] py-[0.05em] font-bold ${who?.isMe ? "bg-hi text-on-hi" : "bg-hover-strong"}`;
      out.push(
        !who ? (
          mention
        ) : renderMention ? (
          <Fragment key={key}>{renderMention(who, mention, chip)}</Fragment>
        ) : (
          <span key={key} title={who.name} className={chip}>
            {mention}
          </span>
        ),
      );
    } else if (url) {
      out.push(
        <a
          key={key}
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="break-words font-semibold underline decoration-2 underline-offset-2 hover:decoration-[3px]"
        >
          {url}
        </a>,
      );
    }
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
