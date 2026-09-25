import type { Face, FaceShape, FaceTone } from "@nook/contracts";

/*
 * Which shape a person is.
 *
 * People are flat shapes with a heavy initial. Until someone picks one, their handle picks the
 * shape and which of the surface's three face colours it takes (lib/accent computes those per
 * surface, so a person always reads on whatever they are drawn on), and the same handle is the same
 * shape everywhere, with no upload and no storage round trip. A member can choose their own shape
 * and colour in their profile instead; the choice is stored by name, so reordering this list never
 * changes anyone.
 *
 * Every shape lives in a 40×40 box, centred, and keeps a solid disc of at least 60% of the box's
 * width around the centre so an initial always fits inside it. `scripts/verify-faces.mjs` measures
 * that, the box, and how distinct each shape is from every other one.
 */

const C = 20;
type Point = [number, number];

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

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

/** Chaikin corner cutting: each pass rounds every corner of a closed outline a little more. */
function soften(points: Point[], passes: number): Point[] {
  let out = points;
  for (let p = 0; p < passes; p += 1) {
    const next: Point[] = [];
    for (let i = 0; i < out.length; i += 1) {
      const [ax, ay] = out[i]!;
      const [bx, by] = out[(i + 1) % out.length]!;
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out = next;
  }
  return out;
}

/** Points along a straight edge, so corner cutting has something to work with on long sides. */
function edge([ax, ay]: Point, [bx, by]: Point, steps = 6): Point[] {
  return Array.from({ length: steps }, (_, i) => [ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps] as Point);
}

/** An arc of a circle, from `from` to `to` radians (0 is +x, clockwise on screen). */
function arc(cx: number, cy: number, r: number, from: number, to: number, steps = 24): Point[] {
  return Array.from({ length: steps }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Point;
  });
}

/** Scales and centres an outline so it spans `span` of the box on its longer side. */
function fit(points: Point[], span = 39): string {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = span / Math.max(x1 - x0, y1 - y0);
  const dx = C - ((x0 + x1) / 2) * k;
  const dy = C - ((y0 + y1) / 2) * k;
  return `${points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${fmt(x * k + dx)} ${fmt(y * k + dy)}`).join("")}Z`;
}

/** A regular polygon's corners, the first straight up. */
function corners(n: number, r: number, turn = 0): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + turn + (i * Math.PI * 2) / n;
    return [C + r * Math.cos(a), C + r * Math.sin(a)] as Point;
  });
}

const outline = (pts: Point[]) => pts.flatMap((p, i) => edge(p, pts[(i + 1) % pts.length]!));

/** A Reuleaux triangle pointing down: three arcs, each centred on the opposite corner. */
function pick(): Point[] {
  const [a, b, c] = corners(3, 20, Math.PI);
  const side = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const at = (from: Point, to: Point) => Math.atan2(to[1] - from[1], to[0] - from[0]);
  return [
    ...arc(a[0], a[1], side, at(a, b), at(a, c)),
    ...arc(b[0], b[1], side, at(b, c), at(b, a)),
    ...arc(c[0], c[1], side, at(c, a), at(c, b)),
  ];
}

/** Three tall round turrets on a flat base; the dips between them stay clear of the initial. */
function crown(): Point[] {
  const bump = (cx: number): Point[] =>
    Array.from({ length: 18 }, (_, i) => {
      const a = Math.PI + (Math.PI * i) / 17;
      return [cx + 6.4 * Math.cos(a), 9 + 8.2 * Math.sin(a)] as Point;
    });
  return [
    ...bump(7.4),
    ...bump(20),
    ...bump(32.6),
    ...edge([39, 9], [39, 39], 6),
    ...edge([39, 39], [1, 39], 8),
    ...edge([1, 39], [1, 9], 6),
  ];
}

/*
 * The catalogue. The first eight are the shipped shapes, in the order the handle hash has always
 * picked from; they must never change or move. Everything after them is new.
 */
export const SHAPES: Record<FaceShape, string> = {
  // Circle.
  circle: "M20 0a20 20 0 1 1 0 40a20 20 0 1 1 0-40Z",
  // Flower: six round petals.
  flower: polar((t) => 15.2 + 4.8 * Math.abs(Math.cos(3 * t)) ** 0.7),
  // Scallop: twelve shallow bumps.
  scallop: polar((t) => 18.3 + 1.7 * Math.cos(12 * t)),
  // Squircle.
  squircle: squircle(4, 19.4),
  // Arch: a round top on a flat foot.
  arch: "M1 40V19A19 19 0 0 1 39 19V40Z",
  // Clover: four lobes.
  clover: polar((t) => 15.5 + 4.5 * Math.abs(Math.cos(2 * t + Math.PI / 4)) ** 0.9),
  // Sparkle: a fat four-point star.
  sparkle: polar((t) => 13.2 + 6.8 * Math.abs(Math.cos(2 * t)) ** 2.4),
  // Pebble: a squircle turned on its corner.
  pebble: squircle(3, 19, Math.PI / 4),

  // Star: five soft points.
  star: polar((t) => 12.9 + 7.1 * ((Math.cos(5 * t) + 1) / 2) ** 1.5, 240),
  // Burst: eight sharp rays.
  burst: polar((t) => 14.4 + 5.6 * ((Math.cos(8 * t) + 1) / 2) ** 2.8, 288),
  // Hex: a hexagon lying flat, corners rounded (on its point it would echo the flower's petals).
  hex: fit(soften(outline(corners(6, 20, Math.PI / 6)), 3), 39.4),
  // Pick: a rounded Reuleaux triangle, like a plectrum.
  pick: fit(soften(pick(), 3), 39),
  // Trefoil: three round lobes.
  trefoil: polar((t) => 16.2 + 3.8 * Math.cos(3 * t), 180),
  // Wave: seven gentle bumps.
  wave: polar((t) => 17.4 + 2.6 * Math.cos(7 * t), 196),
  // Leaf: a square with two opposite corners rounded right off.
  leaf: fit(
    soften(
      [
        ...edge([1, 1], [22, 1]),
        ...arc(22, 18, 17, -Math.PI / 2, 0),
        ...edge([39, 18], [39, 39]),
        ...edge([39, 39], [18, 39]),
        ...arc(18, 22, 17, Math.PI / 2, Math.PI),
        ...edge([1, 22], [1, 1]),
      ],
      2,
    ),
    38,
  ),
  // Drop: a circle with one square corner.
  drop: fit(soften([...arc(20, 20, 19, 0, Math.PI * 1.5, 54), ...edge([20, 1], [39, 1], 4), ...edge([39, 1], [39, 20], 4)], 2), 39),
  // Bowl: the arch upside down, a flat brim on a round foot.
  bowl: "M1 0V21A19 19 0 0 0 39 21V0Z",
  // Blob: an easy, uneven round.
  blob: polar((t) => 16.6 + 2.6 * Math.sin(2 * t + 0.7) + 1.4 * Math.sin(3 * t + 2.2) + 0.6 * Math.sin(5 * t + 0.4), 180),
  // Diamond: a tall rhombus with soft corners.
  diamond: fit(
    soften(
      outline(
        [
          [20, 0],
          [40, 20],
          [20, 40],
          [0, 20],
        ].map(([x, y]) => [20 + (x - 20) * 0.94, y] as Point),
      ),
      3,
    ),
    40,
  ),
  // Capsule: a tall pill.
  capsule: "M20 1a15 15 0 0 1 15 15v8a15 15 0 0 1-30 0v-8A15 15 0 0 1 20 1Z",
  // Crown: three round peaks on a flat base.
  crown: fit(soften(crown(), 2), 39),
};

/** What each shape is called where a person picks one. */
export const SHAPE_NAMES: Record<FaceShape, string> = {
  circle: "Circle",
  flower: "Flower",
  scallop: "Scallop",
  squircle: "Squircle",
  arch: "Arch",
  clover: "Clover",
  sparkle: "Sparkle",
  pebble: "Pebble",
  star: "Star",
  burst: "Burst",
  hex: "Hexagon",
  pick: "Pick",
  trefoil: "Trefoil",
  wave: "Wave",
  leaf: "Leaf",
  drop: "Drop",
  bowl: "Bowl",
  blob: "Blob",
  diamond: "Diamond",
  capsule: "Capsule",
  crown: "Crown",
};

/** The shapes the handle hash picks from, in their original order. */
const GENERATED: FaceShape[] = ["circle", "flower", "scallop", "squircle", "arch", "clover", "sparkle", "pebble"];

/** FNV-1a: stable, fast, and well spread over short strings like handles. */
function hash(value: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The face a handle gets until its owner picks one. */
export function generatedFace(handle: string): Face {
  const h = hash(handle.trim().toLowerCase());
  return { shape: GENERATED[h % GENERATED.length]!, tone: (((h >>> 8) % 3) + 1) as FaceTone };
}

/** A person's face: the one they chose, or the one their handle gives them. */
export function faceOf(user: { handle: string; face?: Face | null }): Face & { path: string } {
  const face = user.face ?? generatedFace(user.handle);
  return { ...face, path: SHAPES[face.shape] };
}

/** Kept for callers that only have a handle. */
export function faceFor(handle: string): { shape: string; tone: FaceTone } {
  const face = generatedFace(handle);
  return { shape: SHAPES[face.shape], tone: face.tone };
}
