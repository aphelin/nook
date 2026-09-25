/*
 * The crowd, played with.
 *
 * Every person is a small body with an offset from where they stand, a velocity and a spin. The
 * cursor is a moving collider: its whole path between two pointer events is tested, so a fast swipe
 * cannot slip between frames. A slow pass nudges people aside; a fast one kicks them into the air,
 * spinning, and anyone they fly into gets knocked too. Gravity brings them down with a bounce and a
 * squash on landing, a spring walks them back to their spot, and they right themselves to the
 * nearest whole turn. The loop runs only while someone is moving and sleeps when all are home.
 *
 * Offsets are in CSS pixels, written as one transform on each person's own wrapper, which nothing
 * else animates (arrival and hops move the wrapper outside it, the flight the one outside that).
 */

import { cssEase } from "@/lib/motion";

const GRAVITY = 2600; // px/s²
const HOME = { stand: 32, standDamp: 10.5, fly: 3.5, flyDamp: 0.7 };
const UPRIGHT = { spring: 95, damp: 13 };
const FAST = 0.85; // px/ms: faster than this, the cursor kicks instead of nudging
const BOUNCE = 0.32;
const RESTITUTION = 0.4;
/** Nobody moves faster than this or leaves by more than this, whatever the cursor does. */
const MAX_SPEED = 3200;
const MAX_REACH = 1400;

interface Body {
  el: HTMLElement;
  face: Element | null;
  box: HTMLElement;
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  awake: boolean;
  airborne: boolean;
  /** Until this moment (ms), a tapped person passes through others instead of handing them their jump. */
  ghostUntil: number;
}

export interface CrowdPhysics {
  /** A pointer moved from (x0, y0) to (x1, y1) over `ms` milliseconds (client pixels). */
  sweep(x0: number, y0: number, x1: number, y1: number, ms: number): void;
  /** Someone was tapped: they jump and turn over. */
  tap(person: Element): void;
  stop(): void;
}

/** Distance from point p to the segment a→b, and the closest point on it. */
function toSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return { d: Math.hypot(px - cx, py - cy), cx, cy };
}

export function crowdPhysics(people: HTMLElement[], wrapper: string): CrowdPhysics {
  const bodies: Body[] = people.map((box) => ({
    el: box.querySelector<HTMLElement>(wrapper)!,
    face: box.querySelector("svg"),
    box,
    size: box.offsetWidth,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    a: 0,
    va: 0,
    awake: false,
    airborne: false,
    ghostUntil: 0,
  }));
  let frame = 0;
  let last = 0;
  // Where everyone stands, in page coordinates, so nothing is measured inside the frame loop.
  let homes: { x: number; y: number }[] = [];
  const measure = () => {
    homes = bodies.map((b) => {
      const r = b.box.getBoundingClientRect();
      return { x: r.left + r.width / 2 + window.scrollX, y: r.top + r.height / 2 + window.scrollY };
    });
  };
  measure();
  const resized = new ResizeObserver(measure);
  resized.observe(people[0]?.parentElement ?? document.body);

  const wake = (b: Body) => {
    b.awake = true;
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(step);
    }
  };

  /** A person's centre on screen right now: where they stand plus where they have been knocked to. */
  const centre = (b: Body, i = bodies.indexOf(b)) => ({ x: homes[i]!.x - window.scrollX + b.x, y: homes[i]!.y - window.scrollY + b.y });

  function land(b: Body, speed: number) {
    // A hard landing squashes the shape for a moment, from the foot.
    if (speed > 420 && b.face) {
      const k = Math.min(0.28, speed / 5000);
      b.face.animate([{ scale: `${1 + k} ${1 - k}`, transformOrigin: "50% 100%" }], { duration: 260, easing: cssEase("--ease-pop") });
    }
  }

  function step(now: number) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    let anyAwake = false;
    for (const b of bodies) {
      if (!b.awake) continue;
      b.airborne = b.y < -0.5 || b.vy < 0;
      const home = b.airborne ? HOME.fly : HOME.stand;
      const damp = b.airborne ? HOME.flyDamp : HOME.standDamp;
      b.vx += (-home * b.x - damp * b.vx) * dt;
      if (b.airborne) b.vy += GRAVITY * dt;
      const v = Math.hypot(b.vx, b.vy);
      if (v > MAX_SPEED) {
        b.vx *= MAX_SPEED / v;
        b.vy *= MAX_SPEED / v;
      }
      b.x = Math.max(-MAX_REACH, Math.min(MAX_REACH, b.x + b.vx * dt));
      b.y = Math.max(-MAX_REACH, b.y + b.vy * dt);
      if (b.y > 0) {
        const impact = b.vy;
        b.y = 0;
        b.vy = impact > 60 ? -impact * BOUNCE : 0;
        b.vx *= 0.78;
        land(b, impact);
      }
      // Spinning freely in the air; on the ground, turning back to the nearest whole turn.
      const upright = Math.round(b.a / 360) * 360;
      if (b.airborne) b.va *= 1 - 0.5 * dt;
      else b.va += (-UPRIGHT.spring * (b.a - upright) - UPRIGHT.damp * b.va) * dt;
      b.a += b.va * dt;

      const still = !b.airborne && Math.abs(b.x) < 0.3 && Math.abs(b.vx) < 4 && Math.abs(b.a - upright) < 0.4 && Math.abs(b.va) < 4;
      if (still) {
        b.x = b.y = b.vx = b.vy = b.va = 0;
        b.a = 0;
        b.awake = false;
        b.el.style.transform = "";
        continue;
      }
      anyAwake = true;
      b.el.style.transform = `translate(${b.x.toFixed(2)}px, ${b.y.toFixed(2)}px) rotate(${b.a.toFixed(2)}deg)`;
    }

    // Someone flying fast knocks into whoever they hit: an elastic-ish collision between equal
    // bodies, applied only while the two are closing, so it hands momentum on and never makes any.
    bodies.forEach((b, i) => {
      if (!b.awake || Math.hypot(b.vx, b.vy) < 650 || b.ghostUntil > now) return;
      const cb = centre(b, i);
      bodies.forEach((o, j) => {
        if (o === b) return;
        const co = centre(o, j);
        const reach = (b.size + o.size) * 0.38;
        const d = Math.hypot(co.x - cb.x, co.y - cb.y);
        if (d > reach || d === 0) return;
        const nx = (co.x - cb.x) / d;
        const ny = (co.y - cb.y) / d;
        const closing = (b.vx - o.vx) * nx + (b.vy - o.vy) * ny;
        if (closing <= 0) return;
        const impulse = (closing * (1 + RESTITUTION)) / 2;
        b.vx -= impulse * nx;
        b.vy -= impulse * ny;
        o.vx += impulse * nx;
        o.vy += impulse * ny;
        o.va += (nx >= 0 ? 1 : -1) * impulse * 0.5;
        wake(o);
        anyAwake = true;
      });
    });

    frame = anyAwake ? requestAnimationFrame(step) : 0;
  }

  return {
    sweep(x0, y0, x1, y1, ms) {
      const speed = Math.hypot(x1 - x0, y1 - y0) / Math.max(ms, 1);
      const dirX = ms ? (x1 - x0) / ms : 0;
      const dirY = ms ? (y1 - y0) / ms : 0;
      bodies.forEach((b, i) => {
        const c = centre(b, i);
        const reach = b.size * 0.55 + 26;
        const hit = toSegment(c.x, c.y, x0, y0, x1, y1);
        if (hit.d > reach) return;
        const f = 1 - hit.d / reach;
        const away = hit.d ? { x: (c.x - hit.cx) / hit.d, y: (c.y - hit.cy) / hit.d } : { x: Math.sign(dirX) || 1, y: -1 };
        if (speed > FAST) {
          // A kick: thrown along the swipe, up into the air, spinning the way it was hit.
          b.vx += dirX * 900 * f + away.x * 260 * f;
          b.vy += Math.min(0, dirY * 500) - (520 + speed * 620) * f;
          b.va += (dirX >= 0 ? 1 : -1) * (320 + speed * 520) * f;
        } else {
          // A nudge: a gentle push for as long as the cursor is there (scaled by the time since the
          // last pointer event, so a slow pass that fires many events pushes no harder).
          const dt = Math.min(ms, 50) / 1000;
          b.vx += away.x * 950 * f * dt;
          b.vy -= 380 * f * dt;
          b.va += (away.x >= 0 ? 1 : -1) * 420 * f * dt;
        }
        wake(b);
      });
    },
    tap(person) {
      const b = bodies.find((x) => x.box === person);
      if (!b) return;
      b.vy -= 1100;
      b.va += (Math.random() > 0.5 ? 1 : -1) * 620;
      // Clear of whoever is on their shoulders, so the jump is theirs.
      b.ghostUntil = performance.now() + 450;
      wake(b);
    },
    stop() {
      resized.disconnect();
      cancelAnimationFrame(frame);
      frame = 0;
      for (const b of bodies) b.el.style.transform = "";
    },
  };
}
