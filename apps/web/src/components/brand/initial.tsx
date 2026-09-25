import type { CSSProperties } from "react";
import { INITIAL_GLYPHS } from "@/lib/initial-glyphs";

/**
 * An initial set heavy inside a face or a disc, placed as `<text x y dy="0.35em"
 * text-anchor="middle">` would place it, but drawn as the letter's own outline (Funnel Display at
 * 800) wherever there is one. Text has its baseline put on a whole pixel, so while the shape
 * grows on hover the letter would jump a pixel against it; an outline scales with the shape
 * exactly, and never waits on the font. A letter outside Latin-1 is set as text, as before.
 */
export function Initial({
  char,
  x = 20,
  y,
  size = 19,
  className = "tint",
  style,
}: {
  char: string;
  x?: number;
  y: number;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const glyph = INITIAL_GLYPHS[char];
  if (!glyph) {
    return (
      <text
        data-initial
        x={x}
        y={y}
        dy="0.35em"
        textAnchor="middle"
        fontSize={size}
        fontWeight={800}
        className={`${className} font-display`}
        style={style}
      >
        {char}
      </text>
    );
  }
  const left = x - (glyph.advance * size) / 2;
  const baseline = y + 0.35 * size;
  return (
    <path
      data-initial
      d={glyph.d}
      transform={`translate(${left.toFixed(3)} ${baseline.toFixed(3)}) scale(${size})`}
      className={className}
      style={style}
    />
  );
}
