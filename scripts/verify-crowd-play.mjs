// Round 3 R11: the crowd is a pile of real bodies you can play with, measured in a real browser.
// A slow pass through the pile is gentle: at least three people flinch as it brushes them, nobody
// is lifted more than 15px, moved more than 60px or turned more than 30°. A
// fast swipe knocks people flying: at least five rise 40px or more, and they come down somewhere
// else and stay there: at rest within 6s, at least five of them more than 20px from where they
// stood, and still there a second later (nobody is walked back to their old spot). Nobody leaves
// the hero, even kicked hard, again and again. Someone tapped jumps at least 100px. Once everyone
// is at rest nothing runs: within 6s of the last kick there is a whole second with no style written. Frames hold at p95 under 25ms
// while people fly. Under reduced motion a swipe or a tap moves nobody.
//
//   node scripts/verify-crowd-play.mjs [base url]
import { chromium } from '@playwright/test';
import { fail } from './lib.mjs';

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const P95_MS = 25;
const browser = await chromium.launch();
const errors = [];

async function open(reducedMotion) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.crowd')?.hasAttribute('data-landed'), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

/** Everyone in the band on screen: centre and turn of their drawing, and its outline's box. */
const people = (page) =>
  page.evaluate(() => {
    const band = [...document.querySelectorAll('.crowd [data-crowd-band]')].find((b) => b.getClientRects().length > 0);
    return [...band.querySelectorAll('[data-person]')].map((p) => {
      const path = p.querySelector('svg path');
      const m = path.getScreenCTM();
      const length = path.getTotalLength();
      const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
      for (let i = 0; i < 80; i += 1) {
        const pt = path.getPointAtLength((length * i) / 80);
        const x = m.a * pt.x + m.c * pt.y + m.e;
        const y = m.b * pt.x + m.d * pt.y + m.f;
        box.left = Math.min(box.left, x);
        box.right = Math.max(box.right, x);
        box.top = Math.min(box.top, y);
        box.bottom = Math.max(box.bottom, y);
      }
      const centre = new DOMPoint(20, 20).matrixTransform(m);
      return { key: p.dataset.person, x: centre.x, y: centre.y, turn: (Math.atan2(m.b, m.a) * 180) / Math.PI, box };
    });
  });

const turned = (a, b) => Math.abs(((b - a + 540) % 360) - 180);

/** The largest move and turn anyone makes over `ms` from `from`, sampled every frame in the page. */
const most = (page, ms) =>
  page.evaluate(
    (ms) =>
      new Promise((done) => {
        const band = [...document.querySelectorAll('.crowd [data-crowd-band]')].find((b) => b.getClientRects().length > 0);
        const els = [...band.querySelectorAll('[data-person] svg path:not([data-initial])')];
        const at = (el) => {
          const m = el.getScreenCTM();
          const c = new DOMPoint(20, 20).matrixTransform(m);
          return { x: c.x, y: c.y, a: (Math.atan2(m.b, m.a) * 180) / Math.PI };
        };
        const start = els.map(at);
        const peak = els.map(() => ({ move: 0, rise: 0, turn: 0, flinched: false }));
        const frames = [];
        let last = performance.now();
        const t0 = last;
        const tick = (now) => {
          frames.push(now - last);
          last = now;
          els.forEach((el, i) => {
            const p = at(el);
            peak[i].move = Math.max(peak[i].move, Math.hypot(p.x - start[i].x, p.y - start[i].y));
            peak[i].rise = Math.max(peak[i].rise, start[i].y - p.y);
            peak[i].turn = Math.max(peak[i].turn, Math.abs(((p.a - start[i].a + 540) % 360) - 180));
            peak[i].flinched ||= el.closest('[data-pop]').getAnimations().length > 0;
          });
          if (now - t0 < ms) requestAnimationFrame(tick);
          else done({ peak, frames: frames.slice(2) });
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );

const p95 = (frames) => [...frames].sort((a, b) => a - b)[Math.floor(frames.length * 0.95)] ?? Infinity;

/** Waits until nobody's drawing moves by 0.1px or turns by 0.1° over 400ms (up to `ms`); returns who is still moving. */
async function rest(page, ms) {
  let moving = [];
  for (const t0 = Date.now(); Date.now() - t0 < ms; ) {
    const a = await people(page);
    await page.waitForTimeout(400);
    const b = await people(page);
    moving = a.filter((p, i) => Math.hypot(b[i].x - p.x, b[i].y - p.y) > 0.1 || turned(p.turn, b[i].turn) > 0.1).map((p) => p.key);
    if (!moving.length) return [];
  }
  return moving;
}

const { ctx, page } = await open('no-preference');
const hero = await page.evaluate(() => {
  const r = document.querySelector('section[aria-labelledby="landing-heading"]').getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
});
const outside = (list) => list.filter((p) => p.box.left < hero.left - 1 || p.box.right > hero.right + 1 || p.box.top < hero.top - 1 || p.box.bottom > hero.bottom + 1);

// 1. A slow pass along the pile, at walking pace (0.4px/ms): nudges only.
await page.mouse.move(700, 60);
const pile = await people(page);
const lowest = Math.max(...pile.map((p) => p.y));
{
  // Arrive at the start of the pass from a standstill: a jump there straight after another move is a swipe.
  await page.waitForTimeout(300);
  const watching = most(page, 3200);
  await page.mouse.move(30, lowest - 30);
  for (let x = 30; x <= 600; x += 8) {
    await page.mouse.move(x, lowest - 30);
    await page.waitForTimeout(20);
  }
  // Out the same way, at the same pace (a jump to the top of the page would be a swipe up through the pile).
  for (let y = lowest - 30; y > lowest - 330; y -= 8) {
    await page.mouse.move(600, y);
    await page.waitForTimeout(20);
  }
  const { peak } = await watching;
  const far = Math.max(...peak.map((p) => p.move));
  const spun = Math.max(...peak.map((p) => p.turn));
  const lifted = Math.max(...peak.map((p) => p.rise));
  const flinched = peak.filter((p) => p.flinched).length;
  if (flinched < 3) fail(`a slow pass through the pile made only ${flinched} people flinch`);
  if (lifted > 15) fail(`a slow pass lifted someone ${lifted.toFixed(0)}px (a hover should not throw anyone)`);
  if (far > 60) fail(`a slow pass shoved someone ${far.toFixed(0)}px (more than a nudge)`);
  if (spun > 30) fail(`a slow pass turned someone ${spun.toFixed(0)}°`);
  console.log(`slow pass: ${flinched} flinched, nobody lifted more than ${lifted.toFixed(0)}px, furthest ${far.toFixed(0)}px, most turn ${spun.toFixed(0)}°`);
}
// Waits are generous: the physics runs in simulated time, so on a loaded machine it takes longer in wall-clock time.
const stillAfterSlow = await rest(page, 6000);
if (stillAfterSlow.length) fail(`after a slow pass the pile did not come to rest: ${stillAfterSlow.join(', ')}`);

// 2. A fast swipe through the pile: people fly, land somewhere else, and stay there.
{
  const before = await people(page);
  await page.waitForTimeout(300);
  const watching = most(page, 1500);
  await page.mouse.move(20, lowest - 40);
  await page.mouse.move(620, lowest - 60, { steps: 5 });
  await page.mouse.move(700, 60);
  const { peak, frames } = await watching;
  const flew = peak.filter((p) => p.rise >= 40).length;
  if (flew < 5) fail(`a fast swipe sent only ${flew} people up 40px or more`);
  const moving = await rest(page, 6000);
  if (moving.length) fail(`6s after a fast swipe, still moving: ${moving.join(', ')}`);
  const after = await people(page);
  const elsewhere = after.filter((p, i) => Math.hypot(p.x - before[i].x, p.y - before[i].y) > 20).length;
  if (elsewhere < 5) fail(`after a fast swipe only ${elsewhere} people ended up somewhere else (they should stay where they land)`);
  await page.waitForTimeout(1000);
  const later = await people(page);
  const drift = Math.max(...later.map((p, i) => Math.hypot(p.x - after[i].x, p.y - after[i].y)));
  if (drift > 3) fail(`after coming to rest someone moved on ${drift.toFixed(1)}px (walked back?)`);
  console.log(`fast swipe: ${flew} flew, ${elsewhere} landed somewhere new and stayed; flight p95 frame ${p95(frames).toFixed(1)}ms`);
  if (p95(frames) > P95_MS) fail(`frames while people fly: p95 ${p95(frames).toFixed(1)}ms > ${P95_MS}ms`);
}

// 3. Nobody leaves the hero, kicked hard again and again.
for (let round = 0; round < 4; round += 1) {
  await page.mouse.move(10, lowest - 20);
  await page.mouse.move(1430, lowest - 120, { steps: 4 });
  await page.mouse.move(700, 60);
  await page.waitForTimeout(700);
}
await rest(page, 5000);
const gone = outside(await people(page));
if (gone.length) fail(`${gone.length} people ended up outside the hero after hard kicks: ${gone.map((p) => p.key).join(', ')}`);
console.log('hard kicks: everyone still inside the hero');

// 4. Asleep when still: within 6s of the last kick there is a whole second with nothing written.
const quietSecond = () =>
  page.evaluate(
    () =>
      new Promise((done) => {
        let n = 0;
        const band = [...document.querySelectorAll('.crowd [data-crowd-band]')].find((b) => b.getClientRects().length > 0);
        const watcher = new MutationObserver((list) => (n += list.length));
        watcher.observe(band, { attributes: true, subtree: true, attributeFilter: ['style'] });
        setTimeout(() => {
          watcher.disconnect();
          done(n);
        }, 1000);
      }),
  );
let writes = Infinity;
for (let i = 0; i < 6 && writes > 0; i += 1) writes = await quietSecond();
if (writes) fail(`6s after the last kick the pile was still being written (${writes} writes in the last second): the loop never sleeps`);
console.log('at rest: no loop running');

// 5. A tap throws someone up.
{
  const now = await people(page);
  const target = now.find((p) => p.key === 'mara') ?? now[0];
  await page.mouse.move(target.x, target.y);
  await page.waitForTimeout(500);
  const watching = most(page, 900);
  await page.mouse.click(target.x, target.y);
  const { peak } = await watching;
  const i = now.indexOf(target);
  if (!(peak[i].rise >= 100)) fail(`a tap lifted ${target.key} only ${peak[i].rise.toFixed(0)}px`);
  console.log(`tap: ${target.key} jumped ${peak[i].rise.toFixed(0)}px`);
}
await ctx.close();

// 6. Reduced motion: nobody moves.
{
  const { ctx, page } = await open('reduce');
  const before = await people(page);
  await page.mouse.move(20, before[0].y);
  await page.mouse.move(1200, before[0].y, { steps: 5 });
  await page.mouse.click(before[0].x, before[0].y);
  await page.waitForTimeout(600);
  const after = await people(page);
  const moved = after.filter((p, i) => Math.hypot(p.x - before[i].x, p.y - before[i].y) > 0.5).length;
  if (moved) fail(`under reduced motion a swipe and a tap moved ${moved} people`);
  console.log('reduced motion: a swipe and a tap move nobody');
  await ctx.close();
}

await browser.close();
if (errors.length) fail(`page errors:\n${errors.slice(0, 5).join('\n')}`);
console.log('CROWD_PLAY_OK');
