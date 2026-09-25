// Polish G7: the landing's motion, measured in a real browser against the dev server.
// The crowd lands and settles on the first screen and inside the hero; the cursor pushes people
// aside and they come back; a club pick makes the crowd hop; scrolling flies the six into the
// who's-here row and seats them exactly; every chapter piece ends fully visible (with a positive
// control that the hidden check can see something hidden); reduced motion shows everything at rest
// at once; phones get a pile and no sideways scroll; no console errors; and frame pacing holds.
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

/** Everyone in the band on screen: their boxes and whether their own moving parts are at rest. */
const crowdState = (page) =>
  page.evaluate(() => {
    const band = [...document.querySelectorAll('.crowd [data-crowd-band]')].find((b) => b.getClientRects().length > 0);
    const hero = document.querySelector('section[aria-labelledby="landing-heading"]').getBoundingClientRect();
    const identity = (el) => {
      const m = new DOMMatrix(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform);
      return Math.abs(m.e) < 0.5 && Math.abs(m.f) < 0.5 && Math.abs(m.a - 1) < 0.01 && Math.abs(m.d - 1) < 0.01 && Math.abs(m.b) < 0.01;
    };
    const people = [...band.querySelectorAll('[data-person]')].map((p) => {
      const r = p.getBoundingClientRect();
      return {
        key: p.dataset.person,
        box: [r.left, r.top, r.right, r.bottom],
        still: identity(p.querySelector('[data-jump]')) && identity(p.querySelector('[data-dodge]')) && identity(p.querySelector('[data-flight]')),
        visible: getComputedStyle(p.querySelector('[data-jump]')).visibility === 'visible',
      };
    });
    return { landed: document.querySelector('.crowd').hasAttribute('data-landed'), hero: [hero.left, hero.top, hero.right, hero.bottom], people, vh: innerHeight };
  });

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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(page, 'desktop');
  await page.addInitScript(recordFrames);
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.crowd')?.hasAttribute('data-landed'), null, { timeout: 15000 });
  const landedAt = await page.evaluate(() => performance.now());
  await page.waitForTimeout(3200);
  const s = await crowdState(page);
  if (s.people.length < 30) fail(`only ${s.people.length} people in the wide crowd`);
  const outside = s.people.filter((p) => !inside(p.box, s.hero));
  if (outside.length) fail(`${outside.length} people outside the hero after landing: ${outside.map((p) => p.key).join(', ')}`);
  const moving = s.people.filter((p) => !p.still || !p.visible);
  if (moving.length) fail(`${moving.length} people not settled 3s after landing: ${moving.map((p) => p.key).join(', ')}`);
  const below = s.people.filter((p) => p.box[3] > s.vh + 1);
  if (below.length) fail(`${below.length} people below the first screen at 1440×900`);
  const landing95 = await p95(page, landedAt, landedAt + 1800);
  console.log(`desktop: ${s.people.length} people settled on the first screen; landing p95 frame ${landing95.toFixed(1)}ms (${Date.now() - t0}ms)`);
  if (landing95 > P95_MS) fail(`frames while the crowd lands: p95 ${landing95.toFixed(1)}ms > ${P95_MS}ms`);

  // Positive control for the visibility check: a chapter piece below the fold is still waiting.
  const waiting = await hiddenPieces(page);
  if (!waiting.length) fail('control: no chapter piece is waiting below the fold, so the hidden check cannot be trusted');

  // The cursor: a slow glide through Mara nudges her aside (people answer the cursor's movement,
  // not where it rests); when it leaves she comes back.
  const mara = s.people.find((p) => p.key === 'mara');
  const [l, t, r, b] = mara.box;
  const mid = (t + b) / 2;
  const nudge = page.evaluate(
    () =>
      new Promise((done) => {
        const band = [...document.querySelectorAll('.crowd [data-crowd-band]')].find((b) => b.getClientRects().length > 0);
        const el = band.querySelector('[data-person="mara"] [data-dodge]');
        let most = 0;
        const t0 = performance.now();
        const tick = (now) => {
          const m = new DOMMatrix(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform);
          most = Math.max(most, Math.hypot(m.e, m.f) + Math.abs(Math.atan2(m.b, m.a)));
          if (now - t0 < 1400) requestAnimationFrame(tick);
          else done(most);
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.mouse.move(l - 50, mid);
  for (let i = 1; i <= 24; i += 1) {
    await page.mouse.move(l - 50 + ((r - l + 100) * i) / 24, mid);
    await page.waitForTimeout(16);
  }
  const leanMatrix = await nudge;
  if (!(leanMatrix > 2)) fail(`Mara did not move aside for the cursor (moved ${leanMatrix.toFixed(2)})`);
  // Sweep across the crowd and measure frames.
  const sweepFrom = await page.evaluate(() => performance.now());
  for (let i = 0; i <= 40; i += 1) {
    await page.mouse.move(40 + (1360 * i) / 40, 760 + Math.sin(i / 3) * 40);
    await page.waitForTimeout(25);
  }
  const sweep95 = await p95(page, sweepFrom, await page.evaluate(() => performance.now()));
  await page.mouse.move(700, 60);
  // A sweep that fast knocks people flying; everyone must be home again within 5s.
  let back = await crowdState(page);
  for (let i = 0; i < 25 && back.people.some((p) => !p.still); i += 1) {
    await page.waitForTimeout(200);
    back = await crowdState(page);
  }
  if (back.people.some((p) => !p.still)) fail(`people did not come back to rest after the cursor left: ${back.people.filter((p) => !p.still).map((p) => p.key).join(', ')}`);
  console.log(`cursor: Mara moved aside (${leanMatrix.toFixed(1)}) and everyone came back; sweep p95 frame ${sweep95.toFixed(1)}ms`);
  if (sweep95 > P95_MS) fail(`frames while the cursor sweeps: p95 ${sweep95.toFixed(1)}ms > ${P95_MS}ms`);

  // A club pick: the crowd hops, then settles.
  await page.getByRole('group', { name: 'Try another club' }).getByRole('button', { name: 'Dog-Eared' }).click();
  await page.waitForTimeout(220);
  const hopping = (await crowdState(page)).people.filter((p) => !p.still).length;
  if (hopping < 10) fail(`only ${hopping} people hopped on a club pick`);
  await page.waitForTimeout(2200);
  if ((await crowdState(page)).people.some((p) => !p.still)) fail('the crowd did not settle after hopping');
  console.log(`club pick: ${hopping} people hopped and settled`);

  // The flight: part way, Mara is travelling; at the end, the six sit exactly in their seats.
  const seatTop = await page.evaluate(() => document.querySelector('[data-seats]').closest('section').getBoundingClientRect().top + scrollY);
  await page.evaluate((y) => window.scrollTo(0, y), seatTop - 900 * 0.72);
  await page.waitForTimeout(1200);
  const travelling = await page.evaluate(() => {
    const band = [...document.querySelectorAll('.crowd [data-crowd-band]')].find((b) => b.getClientRects().length > 0);
    const m = new DOMMatrix(getComputedStyle(band.querySelector('[data-person="mara"] [data-flight]')).transform);
    return Math.hypot(m.e, m.f);
  });
  if (!(travelling > 40)) fail(`Mara was not on her way down part way through the flight (moved ${travelling}px)`);
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
  console.log(`flight: Mara travelled ${travelling.toFixed(0)}px mid-way; all six seated, rings drawn`);

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
  for (let i = 0; i < 5; i += 1) {
    const s = await crowdState(page);
    if (s.people.some((p) => !p.still || !p.visible)) fail(`reduced motion: some of the crowd moved or were hidden (${i * 400}ms after hydrating)`);
    await page.waitForTimeout(400);
  }
  const hidden = await hiddenPieces(page);
  if (hidden.length) fail(`reduced motion: pieces hidden without scrolling: ${hidden.join(', ')}`);
  const seatTop = await page.evaluate(() => document.querySelector('[data-seats]').closest('section').getBoundingClientRect().top + scrollY);
  await page.evaluate((y) => window.scrollTo(0, y), seatTop - 500);
  await page.waitForTimeout(500);
  if ((await crowdState(page)).people.some((p) => !p.still)) fail('reduced motion: the six flew');
  await page.getByRole('group', { name: 'Try another club' }).getByRole('button', { name: 'Patch Bay' }).click({ force: true });
  await page.waitForTimeout(150);
  if ((await crowdState(page)).people.some((p) => !p.still)) fail('reduced motion: the crowd hopped');
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
  await page.waitForTimeout(3000);
  const s = await crowdState(page);
  if (s.people.length < 10) fail(`only ${s.people.length} people in the phone crowd`);
  if (s.people.some((p) => !inside(p.box, s.hero) || !p.still)) fail('phone: the crowd is not settled inside the hero');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 0) fail(`phone: the page scrolls sideways by ${over}px`);
  console.log(`phone: ${s.people.length} people settled; no sideways scroll`);
  await ctx.close();
}

await browser.close();
if (errors.length) fail(`console errors:\n${errors.slice(0, 8).join('\n')}`);
console.log('LANDING_MOTION_OK');
