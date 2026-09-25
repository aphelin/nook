import { SHAPES } from "@/lib/faces";

/*
 * Nook's mark: two people sitting close.
 *
 * Two of the shapes people are drawn as — a circle and a flower — pressed together until they
 * overlap. The flower sits in front with a thin cut of the surface's own colour around it, so the
 * pair reads as two things touching rather than one blob, on any ground and in one ink or two.
 *
 * Everything is in one 44×24 box: each shape is 24 across and they overlap by 4.
 */
export const MARK_W = 44;
export const MARK_H = 24;

const FLOWER = SHAPES.flower;

interface MarkProps {
  /** The mark's width in px; its height follows the 44×24 box. */
  size?: number;
  className?: string;
  /**
   * `kit` fills the two shapes from the surface's first two face colours (so the mark is the
   * club's wherever it sits); `ink` draws both in `currentColor`.
   */
  variant?: "kit" | "ink";
}

export function Mark({ size = 28, className = "", variant = "ink" }: MarkProps) {
  const [a, b] = variant === "kit" ? ["var(--face-1)", "var(--face-2)"] : ["currentColor", "currentColor"];
  return (
    <svg
      width={size}
      height={(size * MARK_H) / MARK_W}
      viewBox={`0 0 ${MARK_W} ${MARK_H}`}
      aria-hidden="true"
      className={`shrink-0 overflow-visible ${className}`}
    >
      <circle cx="12" cy="12" r="12" className="tint" style={{ fill: a }} />
      <path
        d={FLOWER}
        transform="translate(20 0) scale(0.6)"
        strokeWidth={4}
        paintOrder="stroke"
        className="tint"
        style={{ fill: b, stroke: "var(--halo, var(--bg))" }}
      />
    </svg>
  );
}
