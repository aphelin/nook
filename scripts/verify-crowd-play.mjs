// Polish G15: the crowd can be played with, measured in a real browser. A fast swipe through Mara
// knocks her flying (lifted at least 40px or turned at least 30°), and she tumbles back to rest
// exactly where she stood within 3s; a slow pass only nudges (moves, but under 30px); a tap throws
// someone up; frames hold
// at p95 under 25ms while people tumble; under reduced motion a swipe moves nobody.
//
//   node scripts/verify-crowd-play.mjs [base url]
import { chromium } from '@playwright/test';
import { fail } from './lib.mjs';

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
const errors = [];

async function open(reducedMotion) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.crowd')?.hasAttribute('data-landed'), null, { timeout: 15000 });
  await page.waitForTimeout(3200);
  return { ctx, page };
}

/** One person's own knocked-about wrapper: lift (px up), sideways (px) and turn (degrees). */
const pose = (page, key) =>
  page.evaluate((key) => {
    const band = [...document.querySelectorAll('.crowd [data-crowd-band]')].find((b) => b.getClientRects().length > 0);
    const person = band.querySelector(`[data-person="${key}"]`);
    const t = getComputedStyle(person.querySelector('[data-dodge]')).transform;
    const m = new DOMMatrix(t === 'none' ? undefined : t);
    const r = person.getBoundingClientRect();
    return { lift: -m.f, side: m.e, turn: Math.abs((Math.atan2(m.b, m.a) * 180) / Math.PI), box: [r.left, r.top, r.width, r.height] };
  }, key);

/** Samples a pose every frame for `ms`, in the page. */
const watchPose = (page, key, ms) =>
  page.evaluate(
    ([key, ms]) =>
      new Promise((done) => {
        const band = [...document.querySelectorAll('.crowd [data-crowd-band]')].find((b) => b.getClientRects().length > 0);
        const el = band.querySelector(`[data-person="${key}"] [data-dodge]`);
        const out = { lift: 0, turn: 0, side: 0, frames: [] };
        const t0 = performance.now();
        let last = t0;
        const tick = (now) => {
          const t = getComputedStyle(el).transform;
          const m = new DOMMatrix(t === 'none' ? undefined : t);
          out.lift = Math.max(out.lift, -m.f);
          out.side = Math.max(out.side, Math.abs(m.e), Math.abs(m.f));
          out.turn = Math.max(out.turn, Math.abs((Math.atan2(m.b, m.a) * 180) / Math.PI));
          out.frames.push(now - last);
          last = now;
          if (now - t0 < ms) requestAnimationFrame(tick);
          else done(out);
        };
        requestAnimationFrame(tick);
      }),
    [key, ms],
  );

/** Moves the mouse across a person's middle, left to right, `speed` in px/ms (0 = one jump). */
async function swipe(page, box, speed) {
  const [l, t, w, h] = box;
  const y = t + h * 0.5;
  const from = l - 60;
  const to = l + w + 60;
  await page.mouse.move(from, y);
  await page.waitForTimeout(200);
  if (!speed) return page.mouse.move(to, y, { steps: 3 });
  const steps = Math.ceil((to - from) / (speed * 16));
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(from + ((to - from) * i) / steps, y);
    await page.waitForTimeout(16);
  }
}

// Full motion.
{
  const { ctx, page } = await open('no-preference');
  const start = await pose(page, 'mara');
  if (start.lift || start.turn) fail(`Mara is not at rest before the swipe: ${JSON.stringify(start)}`);
  const watching = watchPose(page, 'mara', 1500);
  await swipe(page, start.box, 0);
  await page.mouse.move(700, 60);
  const flew = await watching;
  if (!(flew.lift >= 40 || flew.turn >= 30)) fail(`a fast swipe did not knock Mara flying (lifted ${flew.lift.toFixed(0)}px, turned ${flew.turn.toFixed(0)}°)`);
  const sorted = [...flew.frames].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  if (p95 > 25) fail(`frames while people tumble: p95 ${p95.toFixed(1)}ms > 25ms`);
  await page.waitForTimeout(3000);
  const back = await pose(page, 'mara');
  if (Math.abs(back.lift) > 0.5 || Math.abs(back.side) > 0.5 || back.turn > 0.5) fail(`Mara did not come back to rest where she stood: ${JSON.stringify(back)}`);
  if (back.box.some((v, i) => Math.abs(v - start.box[i]) > 0.5)) fail('Mara’s spot moved');
  console.log(`fast swipe: Mara lifted ${flew.lift.toFixed(0)}px, turned ${flew.turn.toFixed(0)}°, frames p95 ${p95.toFixed(1)}ms; back home`);

  // A slow pass under her: a nudge, not a throw.
  const slow = watchPose(page, 'priya', 1600);
  await swipe(page, (await pose(page, 'priya')).box, 0.25);
  const nudged = await slow;
  if (!(nudged.side > 1)) fail('a slow pass did not move Priya at all');
  if (nudged.lift >= 30 || nudged.side >= 30) fail(`a slow pass threw Priya (moved ${nudged.side.toFixed(0)}px, lifted ${nudged.lift.toFixed(0)}px)`);
  console.log(`slow pass: Priya nudged ${nudged.side.toFixed(1)}px`);

  // A tap throws someone up to turn over (the crowd stands in front of the page, so it can be hit).
  await page.waitForTimeout(1500);
  const theo = await pose(page, 'theo');
  const tapped = watchPose(page, 'theo', 900);
  await page.mouse.click(theo.box[0] + theo.box[2] / 2, theo.box[1] + theo.box[3] * 0.6);
  const up = await tapped;
  if (!(up.lift >= 40)) fail(`a tap did not throw Theo up (lifted ${up.lift.toFixed(0)}px)`);
  console.log(`tap: Theo thrown ${up.lift.toFixed(0)}px up, turned ${up.turn.toFixed(0)}°`);
  await ctx.close();
}

// Reduced motion: nobody moves.
{
  const { ctx, page } = await open('reduce');
  const start = await pose(page, 'mara');
  const watching = watchPose(page, 'mara', 800);
  await swipe(page, start.box, 0);
  const moved = await watching;
  if (moved.side > 0.5 || moved.turn > 0.5) fail(`reduced motion: a swipe moved Mara (${JSON.stringify(moved)})`);
  console.log('reduced motion: a swipe moves nobody');
  await ctx.close();
}

await browser.close();
if (errors.length) fail(`page errors:\n${errors.slice(0, 5).join('\n')}`);
console.log('CROWD_PLAY_OK');
