import type { PresenceState } from "@nook/contracts";
import type { CSSProperties } from "react";

export const PRESENCE_LABEL: Record<PresenceState, string> = {
  online: "Online",
  away: "Away",
  dnd: "Do not disturb",
  offline: "Offline",
};

/*
 * Presence is a shape first and a colour second.
 *
 * Four states have to be told apart by people who cannot rely on hue, so each gets its own
 * silhouette: a filled disc, a disc half-filled, a bar, an open ring. "Here" takes the surface's
 * ring colour (the pop on the wing, the club's other colour on the room and on cards), the others
 * the quiet ink, so "online" is loud on every surface and in every club.
 *
 * The halo punches the shape out of whatever it sits on; every surface class sets `--halo` to
 * its own colour.
 */
const FILL: Record<PresenceState, string> = {
  online: "var(--ring)",
  away: "var(--fg-2)",
  dnd: "var(--fg-2)",
  offline: "var(--fg-2)",
};

export function PresenceShape({
  state,
  size = 10,
  className = "",
  style,
}: {
  state: PresenceState;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const fill = FILL[state];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      aria-label={PRESENCE_LABEL[state]}
      className={`shrink-0 ${className}`}
      style={style}
    >
      <circle cx="8" cy="8" r="8" fill="var(--halo, var(--bg))" />
      {state === "dnd" ? (
        <rect x="2.5" y="6.5" width="11" height="3" rx="1.5" fill={fill} />
      ) : state === "offline" ? (
        <circle cx="8" cy="8" r="4.2" fill="none" stroke={fill} strokeWidth="2.4" />
      ) : state === "away" ? (
        <>
          <circle cx="8" cy="8" r="5.2" fill="none" stroke={fill} strokeWidth="2.2" />
          <path d="M8 2.8a5.2 5.2 0 0 1 0 10.4Z" fill={fill} />
        </>
      ) : (
        <circle cx="8" cy="8" r="5.6" fill={fill} />
      )}
    </svg>
  );
}
