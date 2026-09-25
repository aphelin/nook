// Round 3 R6: the current-channel pill slides on the click, on the compositor. Recorded through a
// CDP screencast: a click on another channel row is followed straight away by 350ms of blocked
// main thread (as drawing a heavy channel would), and the pill must still be seen travelling during
// it (at least three positions between the two rows) and end exactly on the row, with the route
// arriving after. The control swaps the slide for a main-thread animation of the same length, and
// the same recording must see it freeze, so the check can tell the two apart.
//
//   node scripts/verify-pill.mjs [base url]
import { chromium } from '@playwright/test';
import { clearDemoLimit, fail } from './lib.mjs';

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
const errors = [];

async function slide(control) {
  clearDemoLimit();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /try the demo|open nook/i }).first().click();
  await page.waitForURL(/\/app\/[^/]+\/[^/]+/, { timeout: 30000 });
  await page.waitForTimeout(2000);
  const nav = page.locator('nav[aria-label$="channels"]');
  const rows = nav.locator('a[href*="/app/"]');
  // Two rows apart from the current one, so the slide is long enough to catch mid-way.
  const from = await nav.locator('[aria-current="page"]').boundingBox();
  const count = await rows.count();
  let target = null;
  for (let i = 0; i < count; i += 1) {
    const b = await rows.nth(i).boundingBox();
    if (b && Math.abs(b.y - from.y) > 90 && (await rows.nth(i).getAttribute('aria-current')) !== 'page') {
      target = { row: rows.nth(i), box: b };
      break;
    }
  }
  if (!target) fail('no channel row far enough from the current one to slide to');
  if (control)
    await page.evaluate(() => {
      // The same slide, run by the main thread: frame by frame from requestAnimationFrame.
      const pill = document.querySelector('[data-current-pill]');
      pill.animate = function (keyframes, opts) {
        const [a, b] = keyframes.map((k) => new DOMMatrix(k.transform === 'none' ? undefined : k.transform));
        const t0 = performance.now();
        const tick = (now) => {
          const t = Math.min(1, (now - t0) / opts.duration);
          const e = 1 - (1 - t) ** 3;
          pill.style.transform = `translate(${a.e + (b.e - a.e) * e}px, ${a.f + (b.f - a.f) * e}px)`;
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        return { cancel() {} };
      };
      pill.getAnimations = () => [];
    });
  // After the click's own work, the main thread is held for 350ms.
  await page.evaluate(() => {
    document.addEventListener(
      'click',
      () =>
        setTimeout(() => {
          const t = performance.now();
          while (performance.now() - t < 350);
        }, 0),
      { capture: true, once: true },
    );
  });
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ t: f.metadata.timestamp * 1000, data: f.data });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId });
  });
  const pill = await page.evaluate(() => {
    const p = document.querySelector('[data-current-pill]').getBoundingClientRect();
    return { x: p.x, w: p.width, h: p.height };
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await page.waitForTimeout(250);
  const clickAt = Date.now();
  await target.row.click();
  await page.waitForTimeout(1200);
  await cdp.send('Page.stopScreencast');
  // Where the pill is in each frame: the rows of its colour in a strip at its right end (clear of text).
  const colour = await page.evaluate(() => getComputedStyle(document.querySelector('[data-current-pill]')).backgroundColor);
  const ys = await page.evaluate(
    async ({ frames, strip, colour }) => {
      const [r0, g0, b0] = colour.match(/\d+/g).map(Number);
      const out = [];
      for (const f of frames) {
        const img = new Image();
        img.src = `data:image/png;base64,${f.data}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = 6;
        c.height = img.naturalHeight;
        const g = c.getContext('2d');
        g.drawImage(img, strip, 0, 6, img.naturalHeight, 0, 0, 6, img.naturalHeight);
        const d = g.getImageData(0, 0, 6, img.naturalHeight).data;
        let sy = 0, n = 0;
        for (let y = 0; y < img.naturalHeight; y += 1) {
          const i = (y * 6 + 3) * 4;
          if (Math.hypot(d[i] - r0, d[i + 1] - g0, d[i + 2] - b0) < 30) {
            sy += y;
            n += 1;
          }
        }
        out.push({ t: f.t, y: n > 10 ? sy / n : null });
      }
      return out;
    },
    { frames, strip: Math.round(pill.x + pill.w - 12), colour },
  );
  const end = await page.evaluate(() => {
    const p = document.querySelector('[data-current-pill]').getBoundingClientRect();
    const row = document.querySelector('nav[aria-label$="channels"] [aria-current="page"]').getBoundingClientRect();
    return { dy: Math.abs(p.top - row.top), dx: Math.abs(p.left - row.left) };
  });
  await ctx.close();
  const a = from.y + from.height / 2;
  const b = target.box.y + target.box.height / 2;
  // Positions strictly between the two rows, in frames shown while the main thread was held.
  const between = new Set(
    ys
      .filter((f) => f.y !== null && f.t >= clickAt && f.t <= clickAt + 460)
      .filter((f) => Math.min(a, b) + 4 < f.y && f.y < Math.max(a, b) - 4)
      .map((f) => Math.round(f.y)),
  );
  return { between: between.size, end };
}

const real = await slide(false);
const control = await slide(true);
console.log(`pill: ${real.between} positions seen mid-slide while the main thread was held (control on the main thread: ${control.between}); ends ${real.end.dx.toFixed(1)}px/${real.end.dy.toFixed(1)}px off the row`);
if (control.between >= 3) fail(`control: a main-thread slide showed ${control.between} positions while the main thread was held, so the recording cannot tell them apart`);
if (real.between < 3) fail(`the pill showed only ${real.between} positions mid-slide while the main thread was busy: it is not moving on the compositor`);
if (real.end.dx > 0.5 || real.end.dy > 0.5) fail(`the pill ended off its row (${real.end.dx.toFixed(1)}, ${real.end.dy.toFixed(1)})`);
await browser.close();
if (errors.length) fail(`page errors:\n${errors.slice(0, 5).join('\n')}`);
console.log('PILL_OK');
