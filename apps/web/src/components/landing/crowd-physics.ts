/*
 * The crowd, played with: real bodies in a real pile.
 *
 * Every person is a rigid body with their own outline (the convex hull of their shape), mass that
 * grows with their size, friction and a little bounce, in a world with a floor, two walls, the top
 * of the hero as a ceiling and, on wide screens, the live demo as a block they pile up against and
 * only the small ones fit under. The cursor's whole path between two pointer events is tested
 * against everyone, so a fast swipe cannot slip between frames. A slow pass makes whoever it brushes
 * flinch (a squash and a spring back, drawn on their own element, never the physics) and shuffles
 * anyone free to move a step aside, without turning them. A fast swipe knocks people up into the air
 * along it, spinning the way they were hit, and from there it is all the engine's: the flight,
 * whoever they crash into, the landing and where they end up in the pile. Nobody is pulled back to
 * where they stood (people stay where they land), but anyone left standing on the floor with nobody
 * leaning on them gets back upright, the way a person picks themselves up, so their initials read
 * again.
 *
 * The engine is Box2D (planck.js), stepped at a fixed rate and put to sleep with the pile: once
 * nobody is moving, there is no loop running at all.
 *
 * Units: the world is laid out in the band's own layout units (the band scales with the page), at
 * `PER_METRE` units to the metre so people are the sizes Box2D is tuned for. Each person's body
 * writes one transform, on its own element, relative to the spot the server drew them at.
 */

import type { Body, World } from "planck";
import { cssEase } from "@/lib/motion";

/** Layout units to a metre: people are 34–104 units across, so 0.7–2 m. */
const PER_METRE = 50;
const GRAVITY = 2600 / PER_METRE;
const STEP = 1 / 120;
/** Faster than this (layout units per ms), the cursor kicks instead of nudging; kicks stop growing at `TOP`. */
const FAST = 0.8;
const TOP = 4;
/** How fast a nudge walks someone aside (layout units per second). */
const NUDGE = 160;
/** A flinch lasts this long, and nobody flinches again sooner than `FLINCH_REST_MS`. */
const FLINCH_MS = 380;
const FLINCH_REST_MS = 500;
/** Collision categories: the room (floor, walls, ceiling, the demo) and people. */
const ROOM = 0x1;
const PEOPLE = 0x2;
/** A tapped person passes through the others this long, so their jump is theirs (not the pile's on their head). */
const GHOST_S = 0.3;
/**
 * Getting back up: a spring on the angle and a damper on the spin, for someone standing on the floor
 * with nobody leaning on them, for a moment after they were last moving (`RIGHTING_S`). Deeper in
 * the pile a lean stays (turning someone wedged between others would pry the pile apart), and so
 * does a lean they have come to rest in, so everyone can fall asleep.
 */
const RIGHTING = { spring: 55, damp: 9 };
const RIGHTING_S = 1.2;
/** Moving faster than this (m/s), someone is on the move (and will pick themselves up after). */
const MOVING = 1;
/**
 * A heap can come to rest just above Box2D's own sleeping speed, trembling on itself for ever
 * under this much gravity. Once everyone still awake has stayed under a crawl (4 units a second,
 * a sixth of a radian a second) for half a second, the whole pile is put to sleep; anything that
 * touches it wakes it again.
 */
const CALM = { speed: 4 / 50, spin: 0.15, seconds: 0.5 };

export interface CrowdBody {
  /** Where the server drew this person, centre and size, in layout units. */
  spot: { x: number; y: number };
  /** Where they are dropped into this visit's pile, and their lean there (degrees). */
  start: { x: number; y: number; tilt: number };
  size: number;
  /** Degrees the drawing already leans by. */
  tilt: number;
  /** The shape's outline in its 40×40 box, a few dozen points around it. */
  outline: [number, number][];
  /** The element the body moves (translate and rotate, relative to its spot). */
  el: HTMLElement;
  /** The person's own box, for taps. */
  box: HTMLElement;
}

export interface CrowdWorld {
  /** Everyone's centres and angles now, in layout units and radians. */
  positions(): { x: number; y: number; angle: number }[];
  /** Runs the world with nobody touching it until it is at rest (or `seconds` of simulated time). */
  settle(seconds: number): void;
  /** Writes everyone's transform for the band's current scale (px per layout unit). */
  draw(scale: number): void;
  /** The pointer moved from (x0, y0) to (x1, y1), in layout units, over `ms` milliseconds. */
  sweep(x0: number, y0: number, x1: number, y1: number, ms: number): void;
  /** Someone was tapped: they jump and turn over. */
  tap(el: Element): void;
  /** Everyone jumps, `delay(i)` seconds apart, `height(i)` units high. */
  hop(delay: (i: number) => number, height: (i: number) => number): void;
  /** Takes someone out of the world where they are (for their flight), returning their offset from their spot and lean. */
  lift(el: Element): { x: number; y: number; angle: number } | null;
  /** Puts them back where they were lifted from. */
  drop(el: Element): void;
  /** Moves the static block (the demo) to this rectangle, in layout units, or removes it. */
  block(rect: { x: number; y: number; w: number; h: number } | null): void;
  /** The top of the room, in layout units (negative: above the band). */
  ceiling(y: number): void;
  /** Starts or stops the loop when the band comes into or goes out of view. */
  visible(on: boolean): void;
  stop(): void;
}

/** Andrew's monotone chain. */
function hull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Drops the vertex whose loss costs the least area until `max` are left (Box2D takes 12 at most). */
function simplify(points: [number, number][], max: number): [number, number][] {
  const p = [...points];
  const area = (a: [number, number], b: [number, number], c: [number, number]) =>
    Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  while (p.length > max) {
    let worst = 0;
    let least = Infinity;
    for (let i = 0; i < p.length; i += 1) {
      const a = area(p[(i - 1 + p.length) % p.length]!, p[i]!, p[(i + 1) % p.length]!);
      if (a < least) {
        least = a;
        worst = i;
      }
    }
    p.splice(worst, 1);
  }
  return p;
}

/**
 * Pushes each edge of a convex polygon out until every point of `outline` is inside it, and
 * returns the new corners: the hull's corners sit on the drawn outline, so the curve between two of
 * them would otherwise sink into the floor or into a neighbour by a pixel or three.
 */
function enclose(poly: [number, number][], outline: [number, number][]): [number, number][] {
  const n = poly.length;
  // Twice the signed area, to know which side of an edge is outside.
  let area = 0;
  for (let i = 0; i < n; i += 1) area += poly[i]![0] * poly[(i + 1) % n]![1] - poly[(i + 1) % n]![0] * poly[i]![1];
  const side = area > 0 ? 1 : -1;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const normal: [number, number] = [(side * (b[1] - a[1])) / len, (side * (a[0] - b[0])) / len];
    const reach = Math.max(0, ...outline.map((p) => (p[0] - a[0]) * normal[0] + (p[1] - a[1]) * normal[1]));
    return { normal, c: a[0] * normal[0] + a[1] * normal[1] + reach };
  });
  return lines.map((l, i) => {
    const m = lines[(i + 1) % n]!;
    const det = l.normal[0] * m.normal[1] - l.normal[1] * m.normal[0];
    if (Math.abs(det) < 1e-9) return poly[(i + 1) % n]!;
    return [(l.c * m.normal[1] - m.c * l.normal[1]) / det, (l.normal[0] * m.c - m.normal[0] * l.c) / det] as [number, number];
  });
}

const wrap = (angle: number) => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI));

export async function crowdWorld(people: CrowdBody[], layout: { width: number; height: number }): Promise<CrowdWorld> {
  const { World: PlanckWorld, Polygon, Edge, Box, Vec2 } = await import("planck");
  const m = (units: number) => units / PER_METRE;
  const world: World = new PlanckWorld({ gravity: Vec2(0, GRAVITY) });

  // The room: a floor, two walls and a ceiling, all static.
  const room = world.createBody();
  const W = m(layout.width);
  const H = m(layout.height);
  // A floor people slide on when nudged rather than tipping over on (the pile keeps its grip on itself).
  room.createFixture(new Edge(Vec2(-1, H), Vec2(W + 1, H)), { friction: 0.35 });
  room.createFixture(new Edge(Vec2(0, -60), Vec2(0, H + 1)), { friction: 0.2 });
  room.createFixture(new Edge(Vec2(W, -60), Vec2(W, H + 1)), { friction: 0.2 });
  let lid = room.createFixture(new Edge(Vec2(-1, -40), Vec2(W + 1, -40)), { friction: 0.2 });
  let wall: Body | null = null;

  const bodies = people.map((p) => {
    const k = p.size / 40;
    const outline = enclose(simplify(hull(p.outline), 12), p.outline).map(([x, y]) => Vec2(m((x - 20) * k), m((y - 20) * k)));
    const body = world.createDynamicBody({
      position: Vec2(m(p.start.x), m(p.start.y)),
      angle: (p.start.tilt * Math.PI) / 180,
      angularDamping: 2.4,
      linearDamping: 0.05,
    });
    // People grip one another (a pile holds together when one of them is nudged) and barely bounce.
    body.createFixture(new Polygon(outline), { density: 1, friction: 0.9, restitution: 0.08, filterCategoryBits: PEOPLE });
    return body;
  });
  // Heavier to turn than a flat plate of the same mass: a knock sends someone flying more than spinning.
  // (Box2D recomputes mass data whenever rotation is locked or unlocked, so this is set again after.)
  const masses = bodies.map((b) => ({ mass: b.getMass(), center: Vec2.clone(b.getLocalCenter()), I: b.getInertia() * 2.2 }));
  const weigh = () => bodies.forEach((b, i) => b.setMassData(masses[i]!));
  weigh();
  const byBox = new Map(people.map((p, i) => [p.box, i]));
  const flinched = new Map<number, number>();
  const flinch = (i: number) => {
    const now = performance.now();
    if ((flinched.get(i) ?? -Infinity) > now - FLINCH_REST_MS) return;
    flinched.set(i, now);
    // Squashed from the feet, then back with the house's pop.
    people[i]!.el.firstElementChild?.animate([{ scale: "1" }, { scale: "1.07 0.9", offset: 0.3 }, { scale: "1" }], {
      duration: FLINCH_MS,
      easing: cssEase("--ease-pop"),
    });
  };
  const lifted = new Set<number>();

  const hops: { i: number; at: number; speed: number }[] = [];
  let calm = 0;
  const ghosts = new Map<number, number>();
  const righting = bodies.map(() => -Infinity);
  let clock = 0;
  let scale = 1;
  let frame = 0;
  let last = 0;
  let onScreen = true;

  /** Someone resting on them: a person touching them whose centre is well above theirs. */
  const carrying = (b: Body, size: number) => {
    const y = b.getPosition().y;
    for (let c = b.getContactList(); c; c = c.next) {
      if (c.contact.isTouching() && c.other?.isDynamic() && c.other.getPosition().y < y - m(size) * 0.25) return true;
    }
    return false;
  };

  /** On the floor (or against a wall), and nobody else touching them. */
  const standing = (b: Body) => {
    let floor = false;
    for (let c = b.getContactList(); c; c = c.next) {
      if (!c.contact.isTouching()) continue;
      if (c.other?.isStatic()) floor = true;
      else return false;
    }
    return floor;
  };

  function step() {
    clock += STEP;
    for (const [i, until] of ghosts) {
      if (until > clock) continue;
      bodies[i]!.getFixtureList()?.setFilterMaskBits(ROOM | PEOPLE);
      ghosts.delete(i);
    }
    for (let n = hops.length - 1; n >= 0; n -= 1) {
      const h = hops[n]!;
      if (h.at > clock) continue;
      const b = bodies[h.i]!;
      if (!lifted.has(h.i)) b.setLinearVelocity(Vec2(b.getLinearVelocity().x, -h.speed));
      hops.splice(n, 1);
    }
    bodies.forEach((b, i) => {
      if (!b.isAwake() || !b.isDynamic()) return;
      const v = b.getLinearVelocity();
      if (Math.hypot(v.x, v.y) > MOVING) righting[i] = clock + RIGHTING_S;
      if (righting[i]! < clock || !standing(b)) return;
      const a = wrap(b.getAngle());
      b.applyTorque(b.getInertia() * (-RIGHTING.spring * a - RIGHTING.damp * b.getAngularVelocity()), false);
    });
    world.step(STEP, 10, 4);
    let restless = false;
    for (const b of bodies) {
      if (!b.isAwake() || !b.isDynamic()) continue;
      const v = b.getLinearVelocity();
      if (Math.hypot(v.x, v.y) > CALM.speed || Math.abs(b.getAngularVelocity()) > CALM.spin) restless = true;
    }
    calm = restless || hops.length || ghosts.size ? 0 : calm + STEP;
    if (calm >= CALM.seconds) {
      for (const b of bodies) if (b.isDynamic()) b.setAwake(false);
      calm = 0;
    }
  }

  // What each person was last drawn with, so only someone who moved is written again.
  const drawn: string[] = people.map(() => "");
  function draw(k = scale) {
    scale = k;
    bodies.forEach((b, i) => {
      const p = people[i]!;
      const at = b.getPosition();
      const x = (at.x * PER_METRE - p.spot.x) * k;
      const y = (at.y * PER_METRE - p.spot.y) * k;
      const turn = (b.getAngle() * 180) / Math.PI - p.tilt;
      const transform = lifted.has(i)
        ? `rotate(${turn.toFixed(2)}deg)`
        : `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${turn.toFixed(2)}deg)`;
      if (transform === drawn[i]) return;
      drawn[i] = transform;
      p.el.style.transform = transform;
    });
  }

  // The loop runs while a jump is due or anyone is moving.
  const moving = () => hops.length > 0 || ghosts.size > 0 || bodies.some((b) => b.isAwake() && b.isDynamic());

  function tick(now: number) {
    frame = 0;
    const elapsed = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (let t = elapsed; t > STEP / 2; t -= STEP) step();
    draw();
    if (onScreen && moving()) frame = requestAnimationFrame(tick);
  }

  const run = () => {
    if (frame || !onScreen) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  };

  return {
    positions: () => bodies.map((b) => ({ x: b.getPosition().x * PER_METRE, y: b.getPosition().y * PER_METRE, angle: b.getAngle() })),
    settle(seconds) {
      // Nobody turns while the pile first comes to rest, so it forms standing up (at the leans the
      // layout gave them) instead of with people asleep on their sides; once it is at rest they can.
      const rest = (limit: number) => {
        for (let t = 0; t < limit; t += STEP) {
          step();
          if (t > 0.3 && !bodies.some((b) => b.isAwake())) break;
        }
      };
      for (const b of bodies) b.setFixedRotation(true);
      rest(seconds);
      // Then free to turn, it finds its real rest (anyone balanced only because they could not turn
      // slumps now, out of sight, rather than at the first touch).
      for (const b of bodies) {
        b.setFixedRotation(false);
        b.setAwake(true);
      }
      weigh();
      rest(seconds);
      clock = 0;
    },
    draw,
    sweep(x0, y0, x1, y1, ms) {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (!len) return;
      const speed = Math.min(TOP, len / Math.max(ms, 1));
      const dir = { x: dx / len, y: dy / len };
      let hit = false;
      bodies.forEach((b, i) => {
        if (lifted.has(i)) return;
        const at = b.getPosition();
        const cx = at.x * PER_METRE;
        const cy = at.y * PER_METRE;
        // The closest the pointer came to their centre on its way.
        const t = Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / (len * len)));
        const px = x0 + dx * t;
        const py = y0 + dy * t;
        const d = Math.hypot(cx - px, cy - py);
        const reach = people[i]!.size * 0.5 + 10;
        if (d > reach) return;
        const f = 1 - d / reach;
        const away = d ? { x: (cx - px) / d, y: (cy - py) / d } : { x: dir.x || 1, y: -1 };
        const v = b.getLinearVelocity();
        if (len / Math.max(ms, 1) > FAST) {
          // A kick: up into the air and along the swipe, spinning the way they were hit.
          b.setLinearVelocity(Vec2(v.x + m(dir.x * speed * 260 + away.x * 120) * f, v.y + m(-(420 + speed * 260)) * f));
          b.setAngularVelocity(b.getAngularVelocity() + (dir.x >= 0 ? 1 : -1) * (2 + speed * 1.2) * f);
        } else {
          // Everyone the cursor brushes flinches; only someone with nobody resting on them is moved
          // (sliding someone out from under the people on their shoulders would bring them down).
          flinch(i);
          if (carrying(b, people[i]!.size)) return;
          // A nudge: a step aside at walking pace, mostly the way the cursor is going (a hand
          // brushing past) and a little away from it. It eases them towards that pace rather than
          // adding to it, so a slow pass that fires many events never piles up into a shove, and
          // it neither lifts nor turns anyone (the floor and the pile may).
          const want = m(Math.max(-1, Math.min(1, dir.x * 0.7 + away.x * 0.5)) * NUDGE) * f;
          const vx = want > 0 ? Math.max(v.x, v.x + (want - v.x) * 0.5) : Math.min(v.x, v.x + (want - v.x) * 0.5);
          b.setLinearVelocity(Vec2(vx, v.y));
          // Shuffled aside, not rolled: a round person pushed along the floor would otherwise roll over.
          b.setAngularVelocity(b.getAngularVelocity() * 0.4);
        }
        b.setAwake(true);
        hit = true;
      });
      if (hit) run();
    },
    tap(el) {
      const i = byBox.get(el as HTMLElement);
      if (i === undefined || lifted.has(i)) return;
      const b = bodies[i]!;
      b.getFixtureList()?.setFilterMaskBits(ROOM);
      ghosts.set(i, clock + GHOST_S);
      b.setLinearVelocity(Vec2(b.getLinearVelocity().x * 0.3, -m(1050)));
      b.setAngularVelocity((Math.random() > 0.5 ? 1 : -1) * 7.5);
      run();
    },
    hop(delay, height) {
      bodies.forEach((_, i) => {
        // Up to `height` under gravity: v = √(2gh).
        hops.push({ i, at: clock + delay(i), speed: Math.sqrt(2 * GRAVITY * m(height(i))) });
      });
      run();
    },
    lift(el) {
      const i = byBox.get(el as HTMLElement);
      if (i === undefined) return null;
      const b = bodies[i]!;
      const p = people[i]!;
      lifted.add(i);
      b.setType("static");
      draw();
      return {
        x: (b.getPosition().x * PER_METRE - p.spot.x) * scale,
        y: (b.getPosition().y * PER_METRE - p.spot.y) * scale,
        angle: b.getAngle(),
      };
    },
    drop(el) {
      const i = byBox.get(el as HTMLElement);
      if (i === undefined || !lifted.delete(i)) return;
      bodies[i]!.setType("dynamic");
      bodies[i]!.setAwake(true);
      draw();
      run();
    },
    block(rect) {
      if (wall) world.destroyBody(wall);
      wall = null;
      if (!rect) return;
      wall = world.createBody({ position: Vec2(m(rect.x + rect.w / 2), m(rect.y + rect.h / 2)) });
      wall.createFixture(new Box(m(rect.w / 2), m(rect.h / 2)), { friction: 0.4 });
    },
    ceiling(y) {
      room.destroyFixture(lid);
      lid = room.createFixture(new Edge(Vec2(-1, m(y)), Vec2(W + 1, m(y))), { friction: 0.2 });
    },
    visible(on) {
      onScreen = on;
      if (on && moving()) run();
    },
    stop() {
      cancelAnimationFrame(frame);
      frame = 0;
      people.forEach((p, i) => {
        p.el.style.transform = "";
        drawn[i] = "";
      });
    },
  };
}
