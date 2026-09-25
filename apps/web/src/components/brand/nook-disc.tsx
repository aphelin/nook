import type { Kit } from "@nook/contracts";
import { useId } from "react";
import { discStyle } from "@/lib/accent";
import { Initial } from "@/components/brand/initial";

interface NookDiscProps {
  kit?: Kit;
  /** The nook's initial, set heavy in the club's deep colour. */
  initial?: string;
  /** Diameter in px. */
  size?: number;
  /**
   * Drawn in the surface's own highlight instead of the club's colours: for showing the club in
   * scope on its own room, where a bright disc on the bright room would vanish.
   */
  inverse?: boolean;
  className?: string;
}

/** Under this there is no room for a legible initial: the disc is just the club's two colours. */
const INITIAL_MIN = 22;

/**
 * A club as its colours: a disc split between its two, the bright one above and the deep one below
 * like a club badge, with its initial set heavy on the bright part.
 *
 * The same object at every size, from 16px beside a notification to 104px on an invite, so a club
 * always looks like the same club. With a `kit` it shows that club; without one it takes the club
 * in scope.
 */
export function NookDisc({ kit, initial, size = 32, inverse = false, className = "" }: NookDiscProps) {
  const clip = `disc-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const bright = inverse ? "var(--hi)" : "var(--disc, var(--club-bright))";
  const deep = inverse ? "var(--on-hi)" : "var(--disc-deep, var(--club-deep))";
  const lettered = !!initial && size >= INITIAL_MIN;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      style={kit ? discStyle(kit) : undefined}
      className={`shrink-0 overflow-visible ${className}`}
    >
      <g data-grow>
        <defs>
          <clipPath id={clip}>
            <circle cx="20" cy="20" r="20" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clip})`}>
          <rect width="40" height="40" className="tint" style={{ fill: bright }} />
          {/* The deep colour as the badge's lower band; an inverse disc keeps one colour so it reads on its own room. */}
          {!inverse && <rect y={lettered ? 29 : 24} width="40" height="16" className="tint" style={{ fill: deep }} />}
        </g>
        {lettered && <Initial char={initial!.toUpperCase()} y={inverse ? 21 : 16.5} size={inverse ? 21 : 19} style={{ fill: deep }} />}
      </g>
    </svg>
  );
}
