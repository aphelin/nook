/*
 * The paint: a club's colour poured over the screen.
 *
 * Changing clubs, a wave of the new club's paint comes down from the top-left corner and runs off
 * the bottom-right one, and the new room fills in behind it. One plan describes a pour (the slope
 * of its front, how far its band reaches back, how its edges wobble, where its drips hang and when
 * their drops let go), and two things are drawn from it on the same clock:
 *
 *   the room   the new screen, uncovered above a smooth edge that follows the paint (`revealFrames`,
 *              clip-path keyframes the browser runs);
 *   the paint  a band of liquid over that edge and ahead of it (`liquid.ts`, drawn every frame on
 *              the GPU: a blobby front, drips that swell, neck and shed drops, a wet lip and the
 *              light it catches). Its back edge always stays above the room's, so no seam shows.
 *
 * Where WebGL is missing the paint falls back to three clip-path layers (`layerFrames`), still
 * poured and still dripping, only without the liquid.
 *
 * Every edge is a curve y = f(x) sampled at fixed x, so every keyframe has the same commands, which
 * is what lets the browser interpolate between them. The shader repeats `pour` and `wobble` exactly.
 */

export interface Drip {
  x: number;
  /** Half its width at the root. */
  w: number;
  /** How long it gets. */
  length: number;
  /** When it starts to run, in the pour's progress. */
  from: number;
  /** A phase of its own, so no two drips swell together. */
  phase: number;
  /** When its drop lets go, in the pour's progress (above 1: it never does). */
  release: number;
  /** How far it sways from side to side. */
  sway: number;
}

export interface PourPlan {
  width: number;
  height: number;
  slope: number;
  band: number;
  wave: number;
  y0: number;
  y1: number;
  phase: [number, number, number];
  lengths: [number, number, number];
  drips: Drip[];
}

/** mulberry32, so a pour can be drawn again exactly (the checks pass a seed). */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Moving from the first frame, quickest through the middle, settling at the end, like a pour. */
export const pour = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;

export function pourPlan(width: number, height: number, random: () => number = Math.random): PourPlan {
  const W = width;
  const H = height;
  const slope = H / W;
  const band = clamp(Math.min(W, H) * 0.12, 60, 130);
  const wave = clamp(Math.min(W, H) * 0.035, 12, 34);
  const count = clamp(Math.round(W / 170), 4, 10);
  const drips: Drip[] = Array.from({ length: count }, (_, i) => ({
    x: ((i + 0.2 + random() * 0.6) / count) * W,
    w: 9 + random() * 11,
    length: Math.min(H * 0.24, 70 + random() * 160),
    from: random() * 0.25,
    phase: random() * Math.PI * 2,
    // Most of them let a drop go part way through (while the drop still has screen to fall down).
    release: random() < 0.7 ? 0.38 + random() * 0.26 : 2,
    sway: random() * 3,
  }));
  // Every pour sheds a drop or two: the two drips nearest the middle always let go.
  const middle = [...drips].sort((a, b) => Math.abs(a.x - W / 2) - Math.abs(b.x - W / 2));
  for (const [n, d] of middle.slice(0, 2).entries()) if (d.release > 1) d.release = 0.42 + n * 0.1;
  return {
    width: W,
    height: H,
    slope,
    band,
    wave,
    // From wholly above the screen (nothing painted) to the room's edge wholly below it (all painted).
    y0: -(wave * 1.8 + 24),
    y1: H + slope * W + band + wave * 1.8 + 24,
    phase: [random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2],
    lengths: [W * (0.42 + random() * 0.18), W * (0.19 + random() * 0.08), W * (0.09 + random() * 0.04)],
    drips,
  };
}

/** The front's wobble at x, `calm` of its full size; it runs on the clock, so it keeps moving as the pour slows. */
export function wobble(plan: PourPlan, x: number, t: number, calm: number) {
  const { wave, lengths, phase } = plan;
  return (
    wave *
    calm *
    (Math.sin((2 * Math.PI * x) / lengths[0] + phase[0] + t * 5.2) +
      0.55 * Math.sin((2 * Math.PI * x) / lengths[1] + phase[1] - t * 7.4) +
      0.25 * Math.sin((2 * Math.PI * x) / lengths[2] + phase[2] + t * 11))
  );
}

/** Where the new room is uncovered down to, at x and time t. */
export const revealEdge = (plan: PourPlan, x: number, t: number) =>
  plan.y0 + (plan.y1 - plan.y0) * pour(t) - plan.band - plan.slope * x + wobble(plan, x, t, 0.6);

/** Where the paint's front is (its drips aside). */
export const frontEdge = (plan: PourPlan, x: number, t: number) =>
  plan.y0 + (plan.y1 - plan.y0) * pour(t) - plan.slope * x + wobble(plan, x, t, 1);

const sampleXs = (plan: PourPlan, dense: boolean) => {
  const xs = new Set<number>();
  for (let x = -40; x <= plan.width + 40; x += 16) xs.add(Math.round(x));
  if (dense) for (const d of plan.drips) for (let i = -8; i <= 8; i += 1) xs.add(Math.round((d.x + (i / 8) * d.w * 1.25) * 10) / 10);
  return [...xs].sort((a, b) => a - b);
};
const format = (points: [number, number][]) => points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ");

/** clip-path keyframes for the new screen: everything above the room's edge. */
export function revealFrames(plan: PourPlan, keyframes = 60): string[] {
  const at = sampleXs(plan, false);
  const top = -60;
  const fit = (y: number) => clamp(y, top + 10, plan.height + 60);
  return Array.from({ length: keyframes }, (_, k) => {
    const t = k / (keyframes - 1);
    return `path("M -60 ${top} L ${format(at.map((x) => [x, fit(revealEdge(plan, x, t))]))} L ${plan.width + 60} ${top} Z")`;
  });
}

export interface PaintFrames {
  /** clip-path values for the new screen: everything above the front. */
  front: string[];
  /** clip-path values for the paint layer: everything below the room's edge. */
  paint: string[];
  /** clip-path values for the rim layer: everything below the rim's edge. */
  rim: string[];
  /** clip-path values for the gloss stripe. */
  gloss: string[];
}

/** The fallback: the paint as three clip-path layers over a new screen cut to its front. */
export function layerFrames(plan: PourPlan, keyframes = 30): PaintFrames {
  const W = plan.width;
  const H = plan.height;
  const at = sampleXs(plan, true);
  const lead = plan.drips.reduce((m, d) => Math.max(m, d.length), 0);
  const top = -60;
  const foot = H + lead + 60;
  const fit = (y: number) => clamp(y, top + 10, foot - 10);
  const out: PaintFrames = { front: [], paint: [], rim: [], gloss: [] };
  for (let k = 0; k < keyframes; k += 1) {
    const t = k / (keyframes - 1);
    const p = pour(t);
    // Each drip hangs straight down from where it leaves the front, so its end is level however the
    // front slopes: a stem with a round end, out of a swell in the front where the paint gathers.
    const hanging = plan.drips.map((d) => ({
      ...d,
      top: frontEdge(plan, d.x, t),
      run: d.length * smooth(clamp((p - d.from) / (1 - d.from) / 0.7, 0, 1)),
    }));
    const edge = at.map((x) => {
      let f = frontEdge(plan, x, t);
      const own = f;
      for (const d of hanging) {
        const u = (x - d.x) / d.w;
        f = Math.max(f, own + Math.min(d.run, 22) * Math.exp(-(u * u) / 4.5));
        const cap = Math.min(d.w, d.run);
        if (Math.abs(u) < 1) f = Math.max(f, d.top + d.run - cap + cap * Math.sqrt(1 - u * u));
      }
      return { x, f, room: revealEdge(plan, x, t) };
    });
    out.front.push(`path("M -60 ${top} L ${format(edge.map((e) => [e.x, fit(e.f)]))} L ${W + 60} ${top} Z")`);
    const below = (y: (e: (typeof edge)[number]) => number) =>
      `path("M -60 ${foot} L ${format(edge.map((e) => [e.x, fit(y(e))]))} L ${W + 60} ${foot} Z")`;
    out.paint.push(below((e) => e.room));
    out.rim.push(below((e) => e.f - 5));
    const near = edge.map((e) => [e.x, fit(e.f - 11)] as [number, number]);
    const far = edge.map((e) => [e.x, fit(e.f - 17)] as [number, number]).reverse();
    out.gloss.push(`path("M ${format(near)} L ${format(far)} Z")`);
  }
  return out;
}
