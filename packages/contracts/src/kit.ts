import { z } from 'zod';

const Hex = z.string().regex(/^#[0-9a-f]{6}$/i, 'Expected a #rrggbb colour');

/**
 * A nook's kit: its two club colours.
 * `field` owns the crest rail and header stripe; `mark` is reserved for the single active marker.
 */
export const Kit = z.object({
  field: Hex,
  mark: Hex,
});
export type Kit = z.infer<typeof Kit>;

const INK = '#16181b';
const WHITE = '#ffffff';

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The text colour (white or ink) that reads best on a kit colour. */
export function onColor(background: string): string {
  return contrast(WHITE, background) >= contrast(INK, background) ? WHITE : INK;
}

/** Curated kits: every pair keeps text readable on the field and the mark distinct from it. */
export const KIT_PRESETS = [
  { name: 'Pitch', kit: { field: '#0e5b3f', mark: '#f2c12e' } },
  { name: 'Harbour', kit: { field: '#1f4e79', mark: '#f28c28' } },
  { name: 'Oxblood', kit: { field: '#7a1f2b', mark: '#e8c872' } },
  { name: 'Lagoon', kit: { field: '#0f5257', mark: '#f4d35e' } },
  { name: 'Night game', kit: { field: '#1b1d24', mark: '#ff5a36' } },
  { name: 'Terrace', kit: { field: '#9e3a24', mark: '#f7c59f' } },
  { name: 'Violet hour', kit: { field: '#3d2c6b', mark: '#8fe3b0' } },
  { name: 'Moss', kit: { field: '#4a5d23', mark: '#e3cf8e' } },
  { name: 'Signal', kit: { field: '#c8322b', mark: '#16181b' } },
  { name: 'Slate', kit: { field: '#37474f', mark: '#7fd1ff' } },
] as const satisfies readonly { name: string; kit: Kit }[];
