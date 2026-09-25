// Polish G14: the landing's first screen holds together, measured in a real browser.
// The chosen club disc sits centred in its ring on the landing and on the app's rail (equal gap on
// all four sides, within 1px, with an off-centre control); the live demo is never squashed
// (width/height ≤ 1.75, at least 20rem tall, and full of conversation to its top) at 1280×800, 1440×900, 1600×1000 and 1920×1080;
// at 1440×900 the six named people stand fully on the first screen with nothing on top of them;
// the who's-here row reads Mara, Lena, Aiko, Priya, Theo, Sam; and the eight demo people (read from
// the landing's own data, and as drawn in the row) wear eight different shapes.
//
//   node scripts/verify-hero.mjs [base url]
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { fail, root } from './lib.mjs';

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const ROW = ['mara', 'lena', 'aiko', 'priya', 'theo', 'sam'];

const { CLUBS } = await import(pathToFileURL(join(root, 'apps/web/src/components/landing/clubs.ts')).href);
const cast = new Map(CLUBS.flatMap((c) => c.people).map((p) => [p.handle, p.face]));
if (cast.size !== 8) fail(`expected 8 demo people, found ${cast.size}`);
const shapes = new Set([...cast.values()].map((f) => f?.shape));
if (shapes.size !== 8 || shapes.has(undefined)) fail(`demo people share shapes: ${[...cast].map(([h, f]) => `${h}=${f?.shape}`).join(' ')}`);

const browser = await chromium.launch();
const errors = [];

/** Gaps between a ring's inner edge (the element's box inset by its ring) and the disc inside it. */
const gaps = (page, ringSel) =>
  page.evaluate((sel) => {
    const ring = document.querySelector(sel);
    const disc = ring.querySelector('svg');
    const a = ring.getBoundingClientRect();
    const b = disc.getBoundingClientRect();
    return { top: b.top - a.top, bottom: a.bottom - b.bottom, left: b.left - a.left, right: a.right - b.right };
  }, ringSel);
const even = (g) => Math.max(g.top, g.bottom, g.left, g.right) - Math.min(g.top, g.bottom, g.left, g.right) <= 1;
if (even({ top: 7, bottom: 7, left: 4, right: 4 })) fail('control: the centring check did not catch a 3px-off disc');

for (const vp of [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1600, height: 1000 },
  { width: 1920, height: 1080 },
]) {
  const page = await browser.newPage({ viewport: vp });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3200);
  const demo = await page.evaluate(() => {
    const f = document.querySelector('figure').getBoundingClientRect();
    return { w: f.width, h: f.height, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) };
  });
  const ratio = demo.w / demo.h;
  // Full of talk: the conversation reaches the top of its list (fading under the head), no empty band.
  const band = await page.evaluate(() => {
    const list = document.querySelector('figure ol[aria-label^="Messages in"]');
    const top = Math.min(...[...list.children].map((li) => li.getBoundingClientRect().top));
    return top - list.getBoundingClientRect().top;
  });
  if (band > 4) fail(`${vp.width}×${vp.height}: the demo has an empty band of ${band.toFixed(0)}px above its conversation`);
  if (vp.width === 1920) {
    // Control: with most of the talk taken away, the same measurement must see the band.
    const thin = await page.evaluate(() => {
      const list = document.querySelector('figure ol[aria-label^="Messages in"]');
      [...list.children].slice(2).forEach((li) => li.remove());
      const top = Math.min(...[...list.children].map((li) => li.getBoundingClientRect().top));
      return top - list.getBoundingClientRect().top;
    });
    if (!(thin > 4)) fail('control: the empty-band check did not see a thinned-out demo');
  }
  if (ratio > 1.75 || demo.h < 20 * demo.rem) fail(`${vp.width}×${vp.height}: the demo is squashed (${demo.w.toFixed(0)}×${demo.h.toFixed(0)}, ${ratio.toFixed(2)}:1)`);
  const g = await gaps(page, '[role="group"][aria-label="Try another club"] button[aria-pressed="true"]');
  if (!even(g)) fail(`${vp.width}×${vp.height}: the chosen disc sits off-centre in its ring ${JSON.stringify(g)}`);
  let named = '';
  if (vp.width === 1440) {
    const six = await page.evaluate(() => {
      const band = [...document.querySelectorAll('.crowd [data-crowd-band]')].find((b) => b.getClientRects().length > 0);
      return [...band.querySelectorAll('[data-handle]')].map((p) => {
        const r = p.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * 0.55);
        return { h: p.dataset.handle, inView: r.top >= 0 && r.bottom <= innerHeight + 0.5 && r.left >= 0 && r.right <= innerWidth, uncovered: hit?.closest('[data-person]') === p };
      });
    });
    if (six.length !== 6) fail(`expected the six named people in the crowd, found ${six.length}`);
    const hidden = six.filter((p) => !p.inView || !p.uncovered);
    if (hidden.length) fail(`named people off the first screen or covered at 1440×900: ${JSON.stringify(hidden)}`);
    named = '; the six stand clear on the first screen';
  }
  console.log(`${vp.width}×${vp.height}: demo ${demo.w.toFixed(0)}×${demo.h.toFixed(0)} (${ratio.toFixed(2)}:1), full to the top, disc gaps ${Object.values(g).map((v) => v.toFixed(1)).join('/')}${named}`);
  await page.close();
}

// The who's-here row, as drawn: order and faces.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const row = await page.evaluate(() =>
    [...document.querySelectorAll('[data-seats] [data-seat]')].map((s) => ({ h: s.dataset.seat, face: s.querySelector('svg[data-face]')?.dataset.face })),
  );
  if (JSON.stringify(row.map((r) => r.h)) !== JSON.stringify(ROW)) fail(`the who's-here row reads ${row.map((r) => r.h).join(', ')}`);
  if (new Set(row.map((r) => r.face)).size !== row.length) fail(`two people in the who's-here row look alike: ${JSON.stringify(row)}`);
  const drift = row.filter((r) => r.face !== cast.get(r.h)?.shape);
  if (drift.length) fail(`the row draws faces that differ from the demo data: ${JSON.stringify(drift)}`);
  console.log(`row: ${row.map((r) => `${r.h}=${r.face}`).join(' ')}`);
  await page.close();
}

// The app's rail: the current nook's disc, centred in its ring.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /try the demo|open nook/i }).first().click();
  await page.waitForURL(/\/app\/[^/]+\/[^/]+/, { timeout: 20000 });
  await page.waitForTimeout(800);
  const g = await gaps(page, 'nav[aria-label="Nooks"] a[aria-current="page"] > span');
  if (!even(g)) fail(`the rail's current disc sits off-centre in its ring ${JSON.stringify(g)}`);
  console.log(`rail: current disc gaps ${Object.values(g).map((v) => v.toFixed(1)).join('/')}`);
  await ctx.close();
}

await browser.close();
if (errors.length) fail(`page errors:\n${errors.slice(0, 5).join('\n')}`);
console.log('HERO_OK');
