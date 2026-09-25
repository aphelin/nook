import type { Face } from "@nook/contracts";

/*
 * Where everyone in the landing's crowd stands.
 *
 * The pile is worked out once, from a fixed seed, so the server renders it exactly where the
 * browser will: people are dropped one by one onto the floor of a band along the bottom of the
 * first screen and come to rest on the floor or on the shoulders of whoever is already there, each
 * treated as a circle a little smaller than its box (shapes have corners to spare). Two layouts,
 * one for wide screens and one for phones, each in its own units that scale with the band's width.
 */

export interface CrowdPerson {
  key: string;
  face: Face;
  initial: string;
  /** The demo person this is, for the six who fly down into the who's-here row. */
  handle?: string;
}

export interface Placed extends CrowdPerson {
  /** Centre and size, in the layout's units. */
  x: number;
  y: number;
  size: number;
  /** Degrees; everyone stands a little off true. */
  tilt: number;
  /** Paint order: the six named people stand in front. */
  z: number;
}

export interface Layout {
  width: number;
  height: number;
  people: Placed[];
}

/** mulberry32: a tiny, well-mixed seeded generator, so the pile is the same on every render. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BODY = 0.44;

/**
 * Where someone dropped at `x` comes to rest: on the floor, standing on their whole box (flat feet
 * stay flat), or on someone's shoulders, where both are treated as circles of radius `r`.
 */
function rest(x: number, r: number, size: number, floor: number, placed: Placed[]): number {
  let y = floor - size / 2;
  for (const p of placed) {
    const pr = p.size * BODY;
    const dx = Math.abs(x - p.x);
    if (dx < r + pr) y = Math.min(y, p.y - Math.sqrt((r + pr) ** 2 - dx ** 2));
  }
  return y;
}

export function layCrowd({
  width,
  height,
  named,
  extras,
  seed,
  ceiling = () => height,
}: {
  width: number;
  height: number;
  /** The six, left to right, each with where they stand (0–1 across) and how big they are. */
  named: (CrowdPerson & { at: number; size: number })[];
  /** Everyone else, in the order they arrive, each with a size. */
  extras: (CrowdPerson & { size: number })[];
  seed: number;
  /** How high the heap may reach at each x, in units up from the floor (the band's height by default). */
  ceiling?: (x: number) => number;
}): Layout {
  const random = seeded(seed);
  const placed: Placed[] = [];
  for (const n of named) {
    const x = n.at * width;
    placed.push({ ...n, x, y: rest(x, n.size * BODY, n.size, height, placed), size: n.size, tilt: (random() - 0.5) * 10, z: 2 });
  }
  // Everyone else falls into the gaps: try a spread of spots and keep the lowest landing that fits.
  let phase = random();
  for (const e of extras) {
    const r = e.size * BODY;
    let best: { x: number; y: number } | null = null;
    for (let tries = 0; tries < 9; tries += 1) {
      phase = (phase + 0.618033988749895) % 1;
      // Whole box inside the band, edge to edge.
      const x = e.size / 2 + phase * (width - e.size);
      const y = rest(x, r, e.size, height, placed);
      // The top of this person must stay under the ceiling over the whole of their width.
      const room = Math.min(ceiling(x - r), ceiling(x), ceiling(x + r));
      if (y - r < height - room + height * 0.02) continue;
      if (!best || y > best.y) best = { x, y };
    }
    if (best) placed.push({ ...e, x: best.x, y: best.y, size: e.size, tilt: (random() - 0.5) * 22, z: 1 });
  }
  return { width, height, people: placed };
}
