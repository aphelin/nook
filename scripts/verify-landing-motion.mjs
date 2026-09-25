// Round 3 R10: the landing's motion, measured in a real browser.
// The crowd is a different pile on every visit (two loads compared), pops up quickly (everyone
// shown and at rest within 1.2s of the first frame) and stays on the first screen inside the hero;
// a club pick makes nearly everyone jump; scrolling lifts the six out of the pile from wherever the
// physics left them and seats them exactly, the flying half and the seated half agreeing to 1px on
// the way; scrolling back puts them back in the pile where they were; every chapter piece ends
// fully visible (with a positive control that the hidden check can see something hidden); reduced
// motion shows the server's pile at rest at once; phones get a pile and no sideways scroll; no
// console errors; and frame pacing holds while the crowd arrives.
//
//   node scripts/verify-landing-motion.mjs [base url]
import { chromium } from '@playwright/test';
import { fail } from './lib.mjs';

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const P95_MS = 25;

const browser = await chromium.launch();
const errors = [];
const watch = (page, label) => {
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${label}: ${m.text()}`));
};

// Frame times, recorded from the first paint.
const recordFrames = () => {
  window.__frames = [];
  let last = performance.now();
  const tick = (t) => {
    window.__frames.push([t, t - last]);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const p95 = (page, from, to) =>
  page.evaluate(
    ([from, to]) => {
      const d = window.__frames.filter(([t]) => t >= from && t <= to).map(([, d]) => d).sort((a, b) => a - b);
      return d.length ? d[Math.floor(d.length * 0.95)] : Infinity;
    },
    [from, to],
  );

/** Everyone in the band on screen: where their drawings are, and whether they are shown. */
const crowdState = (page) =>
  page.evaluate(() => {
    const band = [...document.querySelectorAll('.crowd [data-crowd-band]')].find((b) => b.getClientRects().length > 0);
    const hero = document.querySelector('section[aria-labelledby="landing-heading"]').getBoundingClientRect();
    // A rotated drawing's bounding box is the box of its rotated box: measure the outline itself.
    const outline = (path) => {
      const m = path.getScreenCTM();
      const length = path.getTotalLength();
      const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
      for (let i = 0; i < 120; i += 1) {
        const pt = path.getPointAtLength((length * i) / 120);
        const x = m.a * pt.x + m.c * pt.y + m.e;
        const y = m.b * pt.x + m.d * pt.y + m.f;
        box.left = Math.min(box.left, x);
        box.right = Math.max(box.right, x);
        box.top = Math.min(box.top, y);
        box.bottom = Math.max(box.bottom, y);
      }
      return box;
    };
    const people = [...band.querySelectorAll('[data-person]')].map((p) => {
      const r = outline(p.querySelector('svg path'));
      const pop = p.querySelector('[data-pop]');
      const cs = getComputedStyle(pop);
      return {
        key: p.dataset.person,
        box: [r.left, r.top, r.right, r.bottom],
        centre: [(r.left + r.right) / 2, (r.top + r.bottom) / 2],
        transform: getComputedStyle(p.querySelector('[data-body]')).transform + getComputedStyle(p.querySelector('[data-flight]')).transform + cs.transform,
        visible: cs.visibility === 'visible' && Number(cs.opacity) > 0.99,
      };
    });
    return { landed: document.querySelector('.crowd').hasAttribute('data-landed'), hero: [hero.left, hero.top, hero.right, hero.bottom], people, vh: innerHeight };
  });

/** At rest: nobody's transform changes over `ms`. */
const atRest = async (page, ms = 300) => {
  const a = await crowdState(page);
  await page.waitForTimeout(ms);
  const b = await crowdState(page);
  return a.people.filter((p, i) => p.transform !== b.people[i].transform || !b.people[i].visible).map((p) => p.key);
};

const inside = (box, [l, t, r, b]) => box[0] >= l - 1 && box[2] <= r + 1 && box[3] <= b + 1 && box[1] >= t - 1;

/** Anything under the landing still hidden or offset by a script. */
const hiddenPieces = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-story], [data-story] [data-arrive], [data-story] mark, [data-typed], [data-seated], [data-seat-label]')]
      .filter((el) => {
        const cs = getComputedStyle(el);
        const clip = cs.clipPath !== 'none' && !/inset\(0(px|%)?( 0(px|%)?)*( round [^)]*)?\)/.test(cs.clipPath);
        return cs.visibility !== 'visible' || Number(cs.opacity) < 0.99 || clip;
      })
      .map((el) => el.dataset.arrive ?? el.dataset.story ?? el.tagName),
  );

// 1. Desktop, full motion.
{
  // Two visits: a different pile each time.
  const piles = [];
  for (let visit = 0; visit < 2; visit += 1) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('.crowd')?.hasAttribute('data-landed'), null, { timeout: 15000 });
    await page.waitForTimeout(1500);
    piles.push(Object.fromEntries((await crowdState(page)).people.map((p) => [p.key, p.centre])));
    await page.close();
  }
  const keys = Object.keys(piles[0]);
  const moved = keys.filter((k) => Math.hypot(piles[0][k][0] - piles[1][k][0], piles[0][k][1] - piles[1][k][1]) > 20).length;
  if (moved < keys.length / 2) fail(`two visits drew nearly the same pile (${moved} of ${keys.length} people more than 20px apart)`);
  console.log(`piles: two visits differ (${moved} of ${keys.length} people more than 20px apart)`);

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(page, 'desktop');
  await page.addInitScript(recordFrames);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.crowd')?.hasAttribute('data-landed'), null, { timeout: 15000 });
  const landedAt = await page.evaluate(() => performance.now());
  // Snappy: shown and at rest within 1.2s of landing.
  await page.waitForTimeout(900);
  const restless = await atRest(page, 300);
  if (restless.length) fail(`${restless.length} people still arriving 1.2s after the crowd landed: ${restless.slice(0, 8).join(', ')}`);
  const s = await crowdState(page);
  if (s.people.length < 30) fail(`only ${s.people.length} people in the wide crowd`);
  const outside = s.people.filter((p) => !inside(p.box, s.hero));
  if (outside.length) fail(`${outside.length} people outside the hero after landing: ${outside.map((p) => p.key).join(', ')}`);
  const below = s.people.filter((p) => p.box[3] > s.vh + 1);
  if (below.length) fail(`${below.length} people below the first screen at 1440×900`);
  const landing95 = await p95(page, landedAt, landedAt + 1200);
  console.log(`desktop: ${s.people.length} people popped up and at rest within 1.2s, all on the first screen; arrival p95 frame ${landing95.toFixed(1)}ms`);
  if (landing95 > P95_MS) fail(`frames while the crowd arrives: p95 ${landing95.toFixed(1)}ms > ${P95_MS}ms`);

  // Positive control for the visibility check: a chapter piece below the fold is still waiting.
  const waiting = await hiddenPieces(page);
  if (!waiting.length) fail('control: no chapter piece is waiting below the fold, so the hidden check cannot be trusted');

  // A club pick: nearly everyone jumps, then the pile comes to rest again.
  await page.mouse.move(700, 60);
  const before = Object.fromEntries(s.people.map((p) => [p.key, p.centre]));
  await page.getByRole('group', { name: 'Try another club' }).getByRole('button', { name: 'Dog-Eared' }).click();
  const rose = new Set();
  for (let t0 = Date.now(); Date.now() - t0 < 1600; ) {
    for (const p of (await crowdState(page)).people) if (before[p.key][1] - p.centre[1] > 6) rose.add(p.key);
    await page.waitForTimeout(40);
  }
  // Not quite everyone: someone pinned under a neighbour who has not jumped yet stays put, as they would.
  if (rose.size < s.people.length * 0.75) fail(`only ${rose.size} of ${s.people.length} jumped on a club pick`);
  let unsettled = [];
  for (let i = 0; i < 20 && (unsettled = await atRest(page)).length; i += 1) await page.waitForTimeout(200);
  if (unsettled.length) fail(`the crowd did not come to rest after jumping: ${unsettled.join(', ')}`);
  console.log(`club pick: ${rose.size} of ${s.people.length} jumped, and the pile came to rest`);

  // The flight: from wherever the pile has them. On the way the two halves agree; at the end the six sit exactly in their seats.
  const pile = Object.fromEntries((await crowdState(page)).people.map((p) => [p.key, p.centre]));
  const halves = () =>
    page.evaluate(() => {
      const band = [...document.querySelectorAll('.crowd [data-crowd-band]')].find((b) => b.getClientRects().length > 0);
      return ['mara', 'lena', 'aiko', 'priya', 'theo', 'sam'].map((h) => {
        const t = band.querySelector(`[data-handle="${h}"] svg`).getBoundingClientRect();
        const g = document.querySelector(`[data-seat="${h}"] [data-seated] svg`).getBoundingClientRect();
        return Math.hypot(t.x + t.width / 2 - (g.x + g.width / 2), t.y + t.height / 2 - (g.y + g.height / 2));
      });
    });
  const seatTop = await page.evaluate(() => document.querySelector('[data-seats]').closest('section').getBoundingClientRect().top + scrollY);
  await page.evaluate((y) => window.scrollTo(0, y), seatTop - 900 * 0.72);
  await page.waitForTimeout(1500);
  const travelling = await page.evaluate(() => {
    const band = [...document.querySelectorAll('.crowd [data-crowd-band]')].find((b) => b.getClientRects().length > 0);
    const m = new DOMMatrix(getComputedStyle(band.querySelector('[data-handle="mara"] [data-flight]')).transform);
    return Math.hypot(m.e, m.f);
  });
  if (!(travelling > 40)) fail(`Mara was not on her way down part way through the flight (moved ${travelling}px)`);
  const apart = Math.max(...(await halves()));
  if (apart > 1) fail(`mid-flight, the flying and the seated halves of someone are ${apart.toFixed(1)}px apart`);
  await page.evaluate((y) => window.scrollTo(0, y), seatTop - 900 * 0.4);
  await page.waitForTimeout(1800);
  const seated = await page.evaluate(() =>
    [...document.querySelectorAll('[data-seat]')].map((seat) => {
      const m = new DOMMatrix(getComputedStyle(seat.querySelector('[data-seated]')).transform);
      const ring = seat.querySelector("path[fill='none']");
      const dash = ring ? getComputedStyle(ring).strokeDasharray : 'none';
      const len = ring ? ring.getTotalLength() : 0;
      const drawn = !ring || dash === 'none' || Number.parseFloat(dash) >= len - 1;
      return { h: seat.dataset.seat, still: Math.hypot(m.e, m.f) < 0.5 && Math.abs(m.a - 1) < 0.01 && Math.abs(m.b) < 0.01, drawn };
    }),
  );
  const unseated = seated.filter((s) => !s.still || !s.drawn);
  if (seated.length !== 6 || unseated.length) fail(`the six are not all seated with rings drawn: ${JSON.stringify(unseated)}`);
  // Back up: the six are back in the pile where the flight took them from.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2200);
  const home = Object.fromEntries((await crowdState(page)).people.map((p) => [p.key, p.centre]));
  const strayed = ['mara', 'lena', 'aiko', 'priya', 'theo', 'sam'].filter((h) => Math.hypot(home[h][0] - pile[h][0], home[h][1] - pile[h][1]) > 2);
  if (strayed.length) fail(`scrolling back up did not put ${strayed.join(', ')} back where the flight took them from`);
  console.log(`flight: Mara travelled ${travelling.toFixed(0)}px mid-way with both halves within ${apart.toFixed(1)}px; all six seated, rings drawn; back in the pile on the way up`);

  // Every chapter, all the way down, ends fully shown.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = seatTop; y < height; y += 300) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(260);
  }
  await page.waitForTimeout(2600);
  const still = await hiddenPieces(page);
  if (still.length) fail(`chapter pieces still hidden after scrolling past them: ${still.join(', ')}`);
  console.log('chapters: every piece arrived and stayed');
  await page.close();
}

// 2. Reduced motion: all at rest, all shown, at once.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  watch(page, 'reduced');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  // Wait for the page to hydrate (the script marks the crowd as standing), then watch it: at rest
  // means nothing moves at any moment, not only at the end.
  await page.waitForFunction(() => document.querySelector('.crowd')?.hasAttribute('data-landed'), null, { timeout: 15000 });
  const plain = (s) => s.people.every((p) => /^(none)+$/.test(p.transform) && p.visible);
  for (let i = 0; i < 5; i += 1) {
    const s = await crowdState(page);
    if (!plain(s)) fail(`reduced motion: some of the crowd moved or were hidden (${i * 400}ms after hydrating)`);
    await page.waitForTimeout(400);
  }
  const hidden = await hiddenPieces(page);
  if (hidden.length) fail(`reduced motion: pieces hidden without scrolling: ${hidden.join(', ')}`);
  const seatTop = await page.evaluate(() => document.querySelector('[data-seats]').closest('section').getBoundingClientRect().top + scrollY);
  await page.evaluate((y) => window.scrollTo(0, y), seatTop - 500);
  await page.waitForTimeout(500);
  if (!plain(await crowdState(page))) fail('reduced motion: the six flew');
  await page.getByRole('group', { name: 'Try another club' }).getByRole('button', { name: 'Patch Bay' }).click({ force: true });
  await page.waitForTimeout(150);
  if (!plain(await crowdState(page))) fail('reduced motion: the crowd hopped');
  console.log('reduced motion: everything at rest and shown at once');
  await ctx.close();
}

// 3. Phone.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  watch(page, 'phone');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.crowd')?.hasAttribute('data-landed'), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const s = await crowdState(page);
  if (s.people.length < 10) fail(`only ${s.people.length} people in the phone crowd`);
  if (s.people.some((p) => !inside(p.box, s.hero)) || (await atRest(page)).length) fail('phone: the crowd is not at rest inside the hero');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 0) fail(`phone: the page scrolls sideways by ${over}px`);
  console.log(`phone: ${s.people.length} people settled; no sideways scroll`);
  await ctx.close();
}

await browser.close();
if (errors.length) fail(`console errors:\n${errors.slice(0, 8).join('\n')}`);
console.log('LANDING_MOTION_OK');
