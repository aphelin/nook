/*
 * Which shape a person is.
 *
 * People are flat shapes with a heavy initial: a circle, a flower, a scallop, a squircle, an arch,
 * a clover, a sparkle, a pebble. The handle picks the shape and which of the surface's three face
 * colours it takes (lib/accent computes those per surface, so a person always reads on whatever
 * they are drawn on), and the same handle is the same shape everywhere, with no upload and no
 * storage round trip. A room of them reads as a crowd because no two neighbours look alike.
 *
 * Every shape lives in a 40×40 box, centred, and keeps at least the middle 60% of the box solid so
 * an initial always fits inside it.
 */

const C = 20;

/** A closed path through `points` samples of a radius function around the box's centre. */
function polar(radius: (t: number) => number, points = 144): string {
  const out: string[] = [];
  for (let i = 0; i < points; i += 1) {
    const t = (i / points) * Math.PI * 2;
    const r = radius(t);
    const x = C + r * Math.cos(t - Math.PI / 2);
    const y = C + r * Math.sin(t - Math.PI / 2);
    out.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `${out.join("")}Z`;
}

/** A superellipse: squarer than a circle, rounder than a square. */
function squircle(n: number, r: number, turn = 0): string {
  return polar((t) => {
    const a = t + turn;
    return r / (Math.abs(Math.cos(a)) ** n + Math.abs(Math.sin(a)) ** n) ** (1 / n);
  });
}

export const SHAPES = [
  // Circle.
  "M20 0a20 20 0 1 1 0 40a20 20 0 1 1 0-40Z",
  // Flower: six round petals.
  polar((t) => 15.2 + 4.8 * Math.abs(Math.cos(3 * t)) ** 0.7),
  // Scallop: twelve shallow bumps.
  polar((t) => 18.3 + 1.7 * Math.cos(12 * t)),
  // Squircle.
  squircle(4, 19.4),
  // Arch: a round top on a flat foot.
  "M1 40V19A19 19 0 0 1 39 19V40Z",
  // Clover: four lobes.
  polar((t) => 15.5 + 4.5 * Math.abs(Math.cos(2 * t + Math.PI / 4)) ** 0.9),
  // Sparkle: a fat four-point star.
  polar((t) => 13.2 + 6.8 * Math.abs(Math.cos(2 * t)) ** 2.4),
  // Pebble: a squircle turned on its corner.
  squircle(3, 19, Math.PI / 4),
] as const;

/** FNV-1a: stable, fast, and well spread over short strings like handles. */
function hash(value: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function faceFor(handle: string): { shape: string; tone: 1 | 2 | 3 } {
  const h = hash(handle.trim().toLowerCase());
  return { shape: SHAPES[h % SHAPES.length]!, tone: (((h >>> 8) % 3) + 1) as 1 | 2 | 3 };
}
