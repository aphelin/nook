import type { ClientMessage } from "@/lib/messages";

export type Row =
  | { kind: "day"; key: string; date: Date }
  | { kind: "new"; key: string }
  | { kind: "message"; key: string; message: ClientMessage; grouped: boolean; endsGroup: boolean };

interface RowOptions {
  /** Your read pointer when you opened the channel: a "new" line goes before the first message after it from someone else. */
  newAfter?: string | null;
  meId?: string;
}

const GROUP_WINDOW_MS = 5 * 60_000;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/**
 * Day dividers between days; consecutive messages from one person within five minutes share a header;
 * and the "new" line where you left off.
 *
 * `grouped` says a row continues the one above it. `endsGroup` says nothing continues *it*, which
 * is what the transcript needs to hang the author's face off the bottom of their last bubble
 * rather than repeating it beside every line.
 */
export function toRows(messages: ClientMessage[], { newAfter, meId }: RowOptions = {}): Row[] {
  const rows: Row[] = [];
  let prev: ClientMessage | null = null;
  let newPlaced = !newAfter;
  for (const m of messages) {
    const at = new Date(m.createdAt);
    const newDay = !prev || dayKey(new Date(prev.createdAt)) !== dayKey(at);
    if (newDay) rows.push({ kind: "day", key: `day-${dayKey(at)}`, date: at });
    const isNew = !newPlaced && !m.status && m.kind === "user" && m.authorId !== meId && m.id > newAfter!;
    if (isNew) {
      rows.push({ kind: "new", key: "new" });
      newPlaced = true;
    }
    const grouped =
      !isNew &&
      !newDay &&
      !!prev &&
      prev.kind === "user" &&
      m.kind === "user" &&
      prev.authorId === m.authorId &&
      !prev.deletedAt &&
      at.getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS;
    // Keyed by clientId when there is one, so the optimistic row and the saved row are the same React row.
    rows.push({ kind: "message", key: m.clientId ?? m.id, message: m, grouped, endsGroup: true });
    prev = m;
  }
  // A row ends its group unless the next message row says it continues from it.
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row?.kind !== "message") continue;
    const next = rows.slice(i + 1).find((r) => r.kind === "message");
    if (next?.kind === "message" && next.grouped) row.endsGroup = false;
  }
  return rows;
}
