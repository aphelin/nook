// Round 4 R26: the rail's discs grow on hover without being cut off, and the Mark settles back
// without a jump. Each nook disc on the rail is hovered in turn and shot at 2x: grown, its drawing
// is 3% to 7% wider than at rest and otherwise the same drawing: the same proportions (within
// 4%), the same place round its centre (within 3%) and the same share of its box filled (within
// 0.03), so no side of it has been cut off. The Mark at the top is hovered and let go while a
// screencast records it: going back, its drawing shrinks a little every frame, no step between
// two frames is more than three times the one before it after the first (a re-raster snapping it
// back shows as one late jump), and once the frames stop coming the last one is the frame from
// before the hover. (A run the machine stalls for more than 150ms is taken again, up to three times.)
//
//   node scripts/verify-rail-hover.mjs [base url]
import { chromium } from '@playwright/test';
import { clearDemoLimit, fail } from './lib.mjs';

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
clearDemoLimit();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: /try the demo|open nook/i }).first().click();
await page.waitForURL(/\/app\/[^/]+\/[^/]+/, { timeout: 30000 });
await page.waitForTimeout(1500);

/** The drawing in a shot of the rail: everything unlike the rail's colour, measured. */
const measure = (png) =>
  page.evaluate(
    async ({ b64 }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const rail = [d[0], d[1], d[2]];
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, area = 0, sx = 0, sy = 0;
      for (let y = 0; y < c.height; y += 1)
        for (let x = 0; x < c.width; x += 1) {
          const i = (y * c.width + x) * 4;
          const k = Math.min(1, Math.hypot(d[i] - rail[0], d[i + 1] - rail[1], d[i + 2] - rail[2]) / 60);
          if (k < 0.5) continue;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
          area += 1;
          sx += x;
          sy += y;
        }
      return { w: x1 - x0 + 1, h: y1 - y0 + 1, left: sx / area - x0, right: x1 + 1 - sx / area, top: sy / area - y0, bottom: y1 + 1 - sy / area, area };
    },
    { b64: png.toString('base64') },
  );

// The discs: rest, then hovered.
const links = page.locator('nav[aria-label="Nooks"] ul li a');
const count = await links.count();
if (count < 3) fail(`only ${count} nooks on the rail`);
const rows = [];
for (let i = 0; i < count; i += 1) {
  const svg = links.nth(i).locator('svg').first();
  await page.mouse.move(700, 450);
  await page.waitForTimeout(350);
  const b = await svg.boundingBox();
  // The disc alone: its svg's box and a margin, but not the current disc's ring round it.
  const pad = 2;
  const clip = { x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad };
  const ringed = await links.nth(i).evaluate((a) => a.getAttribute('aria-current') === 'page' || !!a.querySelector('[data-ring], .ring-in'));
  if (ringed) continue;
  const rest = await measure(await page.screenshot({ clip }));
  await links.nth(i).hover();
  await page.waitForTimeout(450);
  const grown = await measure(await page.screenshot({ clip }));
  const k = grown.w / rest.w;
  const name = (await links.nth(i).getAttribute('aria-label'))?.split(',')[0];
  if (k < 1.03 || k > 1.07) fail(`${name}: hovered, its disc is ${((k - 1) * 100).toFixed(1)}% wider, not 3–7%`);
  // Whole: the same drawing as at rest, only larger (a cut disc loses a side the rest one has).
  if (Math.abs(grown.h / grown.w - rest.h / rest.w) > 0.04) fail(`${name}: hovered, its disc is ${grown.w}×${grown.h} (2x px) against ${rest.w}×${rest.h} at rest, cut on one side`);
  const side = (m) => [m.left / m.w, m.right / m.w, m.top / m.h, m.bottom / m.h];
  const drift = Math.max(...side(grown).map((v, j) => Math.abs(v - side(rest)[j])));
  if (drift > 0.03) fail(`${name}: hovered, its disc sits off its centre by ${(drift * 100).toFixed(1)}% of its width against rest, cut on one side`);
  const fill = (m) => m.area / (m.w * m.h);
  if (Math.abs(fill(grown) - fill(rest)) > 0.03) fail(`${name}: hovered, its disc fills ${fill(grown).toFixed(3)} of its box against ${fill(rest).toFixed(3)} at rest`);
  rows.push(`${name} +${((k - 1) * 100).toFixed(1)}%`);
}
if (rows.length < 2) fail(`only ${rows.length} discs measured`);
console.log(`discs: ${rows.length} hovered, each grown whole (${rows.join(', ')})`);

// The Mark: hovered, then let go, every frame recorded until the frames stop coming. A run in which
// the machine stalled the page (another program's load, memory paging: a long task over 150ms) is
// taken again, up to three times, and reported.
const mark = page.getByRole('link', { name: 'Nook home' });
const cdp = await ctx.newCDPSession(page);
async function recordMark() {
  await page.mouse.move(700, 450);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__stalls = [];
    window.__stallWatch?.disconnect();
    window.__stallWatch = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.duration > 150) window.__stalls.push(Math.round(e.duration));
    });
    window.__stallWatch.observe({ type: 'longtask' });
  });
  const box = await mark.boundingBox();
  const frames = [];
  const onFrame = async (f) => {
    frames.push({ t: Date.now(), data: f.data });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await page.waitForTimeout(300);
  const before = frames.length;
  await mark.hover();
  await page.waitForTimeout(500);
  const held = frames.length;
  await page.mouse.move(700, 450);
  // Until no frame has come for 400ms (the Mark has stopped moving), or 3s.
  const t0 = Date.now();
  await page.waitForTimeout(400);
  while (Date.now() - t0 < 3000 && Date.now() - (frames.at(-1)?.t ?? 0) < 400) await page.waitForTimeout(100);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  const stalls = await page.evaluate(() => window.__stalls);
  return { box, frames, before, held, stalls };
}
let take;
const stalled = [];
for (let attempt = 0; attempt < 3; attempt += 1) {
  take = await recordMark();
  if (!take.stalls.length) break;
  stalled.push(...take.stalls);
  if (attempt === 2) fail(`the machine stalled the page on every try (${stalled.join(', ')}ms), so the Mark could not be measured`);
}
const { box, frames, before, held } = take;
if (before < 1) fail('no frame of the Mark before the hover');
// The screencast is drawn at the viewport's CSS size: crop the Mark from each frame at 1x.
const clip = { x: Math.round(box.x - 8), y: Math.round(box.y - 8), w: Math.round(box.width + 16), h: Math.round(box.height + 16) };
const widths = await page.evaluate(
  async ({ frames, clip }) => {
    const out = [];
    for (const f of frames) {
      const img = new Image();
      img.src = `data:image/png;base64,${f}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = clip.w;
      c.height = clip.h;
      const g = c.getContext('2d');
      g.drawImage(img, clip.x, clip.y, clip.w, clip.h, 0, 0, clip.w, clip.h);
      const d = g.getImageData(0, 0, clip.w, clip.h).data;
      const rail = [d[0], d[1], d[2]];
      // Coverage-weighted area, a size to a fraction of a pixel.
      let area = 0;
      for (let i = 0; i < d.length; i += 4) area += Math.min(1, Math.hypot(d[i] - rail[0], d[i + 1] - rail[1], d[i + 2] - rail[2]) / 120);
      out.push({ area, sig: Array.from(d).join(',') });
    }
    return out;
  },
  { frames: frames.map((f) => f.data), clip },
);
const restArea = widths[before - 1].area;
const back = widths.slice(held);
const peak = widths[held - 1].area;
if (!(peak > restArea * 1.05)) fail(`the Mark did not grow on hover (area ${restArea.toFixed(0)} → ${peak.toFixed(0)})`);
const moving = back.map((f) => f.area).filter((a, i, all) => i === 0 || Math.abs(a - all[i - 1]) > 0.5);
const steps = moving.slice(1).map((a, i) => moving[i] - a);
if (steps.some((s) => s < -2)) fail(`the Mark grew again while shrinking back (steps ${steps.map((s) => s.toFixed(1)).join(' ')})`);
for (let i = 2; i < steps.length; i += 1)
  if (steps[i] > 3 * Math.max(steps[i - 1], 1) && steps[i] > 6) fail(`the Mark snapped back: a step of ${steps[i].toFixed(1)} after ${steps[i - 1].toFixed(1)} (steps ${steps.map((s) => s.toFixed(1)).join(' ')})`);
const last = widths.at(-1);
if (Math.abs(last.area - restArea) > 1 || last.sig !== widths[before - 1].sig) fail(`the Mark did not settle back to how it was (area ${restArea.toFixed(1)} → ${last.area.toFixed(1)})`);
console.log(
  `mark: grew ${((peak / restArea - 1) * 100).toFixed(0)}% and shrank back over ${steps.length} steps (${steps.map((s) => s.toFixed(0)).join(' ')}), ending as it began${stalled.length ? ` (taken again after the machine stalled the page for ${stalled.join(', ')}ms)` : ''}`,
);

await browser.close();
if (errors.length) fail(`page errors:\n${errors.slice(0, 5).join('\n')}`);
console.log('RAIL_HOVER_OK');
