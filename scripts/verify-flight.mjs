// Round 4 R24: people fly from the pile to their seats without spinning. The pile is kicked hard,
// again and again, until people have tumbled over (the physics counts every turn, so someone can
// lie at 400° or more), and left to settle. Then the page is scrolled a little at a time through
// the flight into the next chapter, every frame read. However far anyone tumbled in the pile, no
// flyer turns more than 200° on the way (the nearer way round to upright, plus the sway), anyone
// with more than 30° to turn goes one way round (no swing of more than 3° the other way first), and
// each lands upright in their seat.
//
//   node scripts/verify-flight.mjs [base url]
import { chromium } from '@playwright/test';
import { fail } from './lib.mjs';

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const LIMIT = 200;
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('.crowd')?.hasAttribute('data-landed'), null, { timeout: 15000 });
await page.waitForTimeout(1500);

/** How far each flyer's drawing has turned in all, from the rotate() the physics last wrote. */
const turns = () =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-handle] > [data-flight]')]
        // The band on screen (the others, for other widths, are not drawn).
        .filter((f) => f.getClientRects().length > 0)
        .map((f) => {
          const spot = f.closest('[data-handle]');
          const body = f.querySelector('[data-body]');
          const turn = Number(/rotate\((-?[\d.]+)deg\)/.exec(body?.style.transform ?? '')?.[1] ?? 0);
          return [spot.dataset.handle, turn + Number(spot.dataset.tilt ?? 0)];
        })
        .filter(([, v]) => Number.isFinite(v)),
    ),
  );

// Kick the pile across its whole width, low and fast, several times over.
const lowest = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.crowd [data-body]')].map((b) => b.getBoundingClientRect().bottom)));
let most = 0;
for (let round = 0; round < 6 && most <= 180; round += 1) {
  for (const [a, b] of [
    [10, 1430],
    [1430, 10],
  ]) {
    await page.mouse.move(a, lowest - 30);
    await page.mouse.move(b, lowest - 90, { steps: 3 });
    await page.mouse.move(700, 40);
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(2500);
  most = Math.max(most, ...Object.values(await turns()).map(Math.abs));
}
await page.mouse.move(700, 40);
await page.waitForTimeout(3000);
const before = await turns();
most = Math.max(...Object.values(before).map(Math.abs));

// Read every frame while the page is scrolled through the flight.
await page.evaluate(() => {
  window.__flight = {};
  const tick = () => {
    for (const f of document.querySelectorAll('[data-handle] > [data-flight]')) {
      if (!f.getClientRects().length) continue;
      const handle = f.closest('[data-handle]')?.dataset.handle;
      const turn = Number(/rotate\((-?[\d.]+)deg\)/.exec(f.style.transform)?.[1] ?? 0);
      const seen = (window.__flight[handle] ??= { min: 0, max: 0 });
      seen.min = Math.min(seen.min, turn);
      seen.max = Math.max(seen.max, turn);
    }
    if (!window.__stopFlight) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const section = await page.evaluate(() => {
  const row = document.querySelector('[data-seats]');
  return row.closest('section').getBoundingClientRect().top + scrollY;
});
// From the chapter's top at the bottom of the screen to it well past 45%, in small steps.
const from = Math.max(0, section - 900);
await page.evaluate((y) => scrollTo(0, y), from);
await page.waitForTimeout(600);
for (let y = from; y < section - 250; y += 60) {
  await page.mouse.wheel(0, 60);
  await page.waitForTimeout(90);
}
await page.waitForTimeout(1500);
const flight = await page.evaluate(() => {
  window.__stopFlight = true;
  return window.__flight;
});

const flyers = Object.keys(flight).filter((h) => flight[h].max - flight[h].min > 0.5);
if (flyers.length < 4) fail(`only ${flyers.length} people were seen flying`);
for (const h of flyers) {
  const turned = Math.max(Math.abs(flight[h].min), Math.abs(flight[h].max));
  if (turned > LIMIT) fail(`${h} turned ${turned.toFixed(0)}° on the way to their seat (they lay at ${before[h]?.toFixed(0)}° in the pile)`);
  // One way round: anyone with far to turn does not swing the other way first.
  const back = Math.min(Math.abs(flight[h].min), Math.abs(flight[h].max));
  if (turned > 30 && back > 3) fail(`${h} swung ${back.toFixed(0)}° the wrong way before turning ${turned.toFixed(0)}° upright`);
}
// Upright in their seats.
const seated = await page.evaluate(() =>
  [...document.querySelectorAll('[data-seated]')].filter((g) => g.getClientRects().length > 0).map((g) => {
    const m = new DOMMatrix(getComputedStyle(g).transform);
    return [g.closest('[data-seat]')?.dataset.seat, (Math.atan2(m.b, m.a) * 180) / Math.PI];
  }),
);
for (const [h, a] of seated) if (Math.abs(a) > 1) fail(`${h} landed leaning ${a.toFixed(1)}°`);
const worst = Math.max(...flyers.map((h) => Math.max(Math.abs(flight[h].min), Math.abs(flight[h].max))));
console.log(
  `${flyers.length} people flew; the most anyone had tumbled in the pile was ${most.toFixed(0)}°, the most anyone turned on the way ${worst.toFixed(0)}°; all ${seated.length} landed upright`,
);
if (most <= 180) console.log('note: nobody tumbled past 180° in the pile this run');

await browser.close();
if (errors.length) fail(`page errors:\n${errors.slice(0, 5).join('\n')}`);
console.log('FLIGHT_OK');
