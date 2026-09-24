import type { PresenceState, PublicUser } from "@nook/contracts";
import { faceFor } from "@/lib/faces";
import { PresenceShape } from "./presence-shape";

/*
 * People are shapes.
 *
 * Each person is a flat shape with their initial set heavy inside it, filled from the face colours
 * of whatever surface they are on (see lib/faces for which shape and colour a handle gets). An
 * uploaded photo always wins — it is the one thing a member explicitly chose — and it is cut to
 * their shape, so a photo reads as the same person.
 *
 * Everyone is always a solid shape. Presence is what is around the shape, never the shape itself:
 * someone who is here carries a ring in their own outline, the way a story ring says "something
 * new", and the presence mark in the corner names all four states where there is room for it.
 */

interface AvatarProps {
  user: Pick<PublicUser, "displayName" | "handle" | "avatarUrl">;
  size?: number;
  className?: string;
  /** Adds the presence mark in the bottom-right corner. */
  presence?: PresenceState;
  /** A ring in the person's own outline, for people who are here (the who's-here strip). */
  ring?: boolean;
}

/** Under this there is no room for a legible initial; the shape alone carries the person. */
const INITIAL_MIN = 20;

/** A shape's path as a CSS mask, so a photo can be cut to it and still be a plain `<img>`. */
const shapeMask = (d: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><path d='${d}'/></svg>`)}")`;

export function Avatar({ user, size = 32, className = "", presence, ring = false }: AvatarProps) {
  const { shape, tone } = faceFor(user.handle);
  const initial = (user.displayName.trim()[0] ?? user.handle[0] ?? "?").toUpperCase();
  // The ring sits outside the shape with a gap, so the box grows to hold it.
  const pad = ring ? 7 : 0;
  const box = 40 + pad * 2;

  // A photo is a real image, cut to the person's shape with a mask drawn from the same path.
  const photo = user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- user uploads are served from object storage
    <img
      src={user.avatarUrl}
      alt=""
      width={size}
      height={size}
      className="block size-full object-cover"
      style={{ maskImage: shapeMask(shape), maskSize: "100% 100%" }}
    />
  ) : null;

  const drawing = (
    <svg
      width={size}
      height={size}
      viewBox={`${-pad} ${-pad} ${box} ${box}`}
      aria-hidden="true"
      className={`shrink-0 overflow-visible ${photo ? "absolute inset-0 size-full" : className}`}
    >
      {ring && (
        <path
          d={shape}
          transform="translate(20 20) scale(1.3) translate(-20 -20)"
          fill="none"
          strokeWidth={2.4}
          className="tint"
          style={{ stroke: "var(--ring)" }}
        />
      )}
      {!photo && <path d={shape} className="tint" style={{ fill: `var(--face-${tone})` }} />}
      {!photo && size >= INITIAL_MIN && (
        <text
          x="20"
          y="21"
          dy="0.35em"
          textAnchor="middle"
          fontSize="19"
          fontWeight={800}
          className="tint font-display"
          style={{ fill: `var(--on-face-${tone})` }}
        >
          {initial}
        </text>
      )}
    </svg>
  );

  // With a photo, the image fills the shape's box (inset by the ring's room) and the ring, if any, is drawn over it.
  const svg = photo ? (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      <span className="absolute" style={{ inset: `${(pad / box) * 100}%` }}>
        {photo}
      </span>
      {ring && drawing}
    </span>
  ) : (
    drawing
  );

  if (!presence) return svg;
  const dot = Math.min(14, Math.max(9, Math.round(size * 0.36)));
  return (
    <span className="relative inline-flex shrink-0">
      {svg}
      <PresenceShape state={presence} size={dot} className="absolute -right-1 -bottom-0.5" />
    </span>
  );
}
