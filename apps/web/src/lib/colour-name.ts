/*
 * A plain word for a colour, for places where a colour has to be said out loud.
 *
 * Face colours are slots the nook fills from its own kit, so the only honest name for one is the
 * colour it is right now, here. This reads it off the rendered fill (any `rgb()` string) and
 * returns an everyday word: "orange", "navy", "pink", "white", "dark red". Coarse on purpose — it
 * tells two swatches apart for someone who cannot see them, it is not a colour dictionary.
 */
/** Where each hue name ends, in degrees round the wheel. */
const HUES: [number, string][] = [
  [12, "red"],
  [40, "orange"],
  [64, "yellow"],
  [90, "lime"],
  [160, "green"],
  [190, "teal"],
  [250, "blue"],
  [290, "purple"],
  [345, "pink"],
  [360, "red"],
];

export function colourName(css: string): string {
  const parts = css.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return "";
  const [r, g, b] = parts.slice(0, 3).map((v) => Number(v) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (l > 0.92) return "white";
  if (l < 0.12) return "near-black";
  if (s < 0.14) return l > 0.7 ? "light grey" : l < 0.3 ? "charcoal" : "grey";
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const hue = HUES.find(([end]) => h < end)?.[1] ?? "red";
  if (hue === "blue" && l < 0.38) return "navy";
  if (hue === "orange" && l < 0.35) return "brown";
  if (l < 0.3) return `dark ${hue}`;
  if (l > 0.8) return `pale ${hue}`;
  return hue;
}
