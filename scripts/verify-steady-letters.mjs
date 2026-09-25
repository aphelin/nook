// Round 3 R5: a letter stays put in its shape while the shape grows on hover. Recorded through the
// compositor (a CDP screencast, so what the screen shows, not what the DOM says): a nook's disc on the rail is hovered and unhovered, and in every frame the initial's ink
// is located against the disc it sits on (both by coverage-weighted centroids, to a fraction of a pixel). With the fix, the letter never moves more than 0.7px
// against its disc; the control (the same hover the old way: the HTML box around the drawing
// scaled, with no layer of its own, and the initial set as hinted text) must move it more than
// 1.1px, so the measurement can see the bug it guards against.
// Round 4 R25: a growing drawing grows inside its own SVG instead of on a layer (a layer's texture
// is cut off at its bounds and blurs, then snaps sharp when the hover ends). Across the rail, the
// room and the landing: no box that scales on hover, press or an open popup holds a drawn initial
// (the drawing grows itself, `data-grow` inside `data-grows`), every `data-grows` has a drawing
// inside that grows, and nothing that grows is on a layer of its own (`will-change`). Text puts
// its baseline on a whole pixel, so it jumps a pixel against a growing shape: every initial drawn
// in the room and on the landing is the letter's outline, a path, not text.
//
//   node scripts/verify-steady-letters.mjs [base url]
import { chromium } from '@playwright/test';
import { fail } from './lib.mjs';

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';
// The screencast is drawn at the viewport's CSS size whatever the density, so it is measured at 1x,
// with centroids (weighted by coverage) for sub-pixel positions.
const DPR = 1;
const UNFIX = [
  'nav[aria-label="Nooks"] a [data-grow] { scale: 1 !important; transition: none !important; }',
  'nav[aria-label="Nooks"] a > span { transition: scale 200ms cubic-bezier(0.16, 1, 0.3, 1); }',
  'nav[aria-label="Nooks"] a:hover > span { scale: 1.05; }',
  'svg text { text-rendering: auto !important; }',
].join(' ');
const browser = await chromium.launch();

async function signedIn() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /try the demo|open nook/i }).first().click();
  await page.waitForURL(/\/app\/[^/]+\/[^/]+/, { timeout: 30000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

/** The initial set as text again, where the outline is now (the control). */
const asText = () => {
  for (const path of document.querySelectorAll('nav[aria-label="Nooks"] path[data-initial]')) {
    const [, baseline, size] = /translate\([-\d.]+ ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(path.getAttribute('transform')).map(Number);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '20');
    text.setAttribute('y', String(baseline - 0.35 * size));
    text.setAttribute('dy', '0.35em');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', String(size));
    text.setAttribute('font-weight', '800');
    text.setAttribute('class', 'font-display');
    text.setAttribute('style', path.getAttribute('style') ?? '');
    text.textContent = path.closest('a')?.getAttribute('aria-label')?.trim()[0]?.toUpperCase() ?? 'D';
    path.replaceWith(text);
  }
};

/** Hovers a rail disc, records every frame, and returns the worst drift of its letter (CSS px). */
async function drift(patch) {
  const { ctx, page } = await signedIn();
  if (patch) {
    await page.addStyleTag({ content: patch });
    await page.evaluate(asText);
    await page.evaluate(() => document.fonts.ready);
  }
  const sel = 'nav[aria-label="Nooks"] li:nth-child(2) a > span';
  await page.mouse.move(700, 450);
  await page.waitForTimeout(300);
  const box = await page.locator(sel).first().boundingBox();
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push(f.data);
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId });
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: 1440 * DPR, maxHeight: 900 * DPR });
  await page.waitForTimeout(250);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 2 });
  await page.waitForTimeout(500);
  await page.mouse.move(700, 450, { steps: 2 });
  await page.waitForTimeout(500);
  await cdp.send('Page.stopScreencast');
  const pad = 6;
  const clip = { x: Math.round((box.x - pad) * DPR), y: Math.round((box.y - pad) * DPR), w: Math.round((box.width + 2 * pad) * DPR), h: Math.round((box.height + 2 * pad) * DPR) };
  const out = await page.evaluate(
    async ({ frames, clip }) => {
      const res = [];
      for (const data of frames) {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = clip.w;
        c.height = clip.h;
        const g = c.getContext('2d');
        g.drawImage(img, clip.x, clip.y, clip.w, clip.h, 0, 0, clip.w, clip.h);
        const d = g.getImageData(0, 0, clip.w, clip.h).data;
        const px = (x, y) => {
          const i = (y * clip.w + x) * 4;
          return [d[i], d[i + 1], d[i + 2]];
        };
        const lum = ([r, gg, b]) => 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        const rail = px(1, 1);
        // The disc: every pixel unlike the rail, weighted by how unlike (edges count by coverage).
        let dx = 0, dy = 0, area = 0;
        for (let y = 0; y < clip.h; y += 1)
          for (let x = 0; x < clip.w; x += 1) {
            const [r, gg, b] = px(x, y);
            const k = Math.min(1, Math.hypot(r - rail[0], gg - rail[1], b - rail[2]) / 60);
            dx += x * k;
            dy += y * k;
            area += k;
          }
        const cx = dx / area;
        const cy = dy / area;
        const radius = Math.sqrt(area / Math.PI);
        // The initial: ink on the disc's bright upper part (above its deep band), weighted by how dark.
        const bright = lum(px(Math.round(cx), Math.round(cy - radius * 0.8)));
        let sx = 0, sy = 0, sw = 0;
        for (let y = Math.floor(cy - radius); y < cy + radius * 0.3; y += 1)
          for (let x = Math.floor(cx - radius); x <= cx + radius; x += 1) {
            if (Math.hypot(x - cx, y - cy) > radius * 0.85) continue;
            const k = Math.max(0, Math.min(1, (bright - lum(px(x, y))) / (bright * 0.6)));
            sx += x * k;
            sy += y * k;
            sw += k;
          }
        res.push({ radius, x: (sx / sw - cx) / radius, y: (sy / sw - cy) / radius });
      }
      return res;
    },
    { frames, clip },
  );
  await ctx.close();
  const base = out[0];
  // The letter's offset from the disc's centre, as a share of the disc, compared with the first
  // frame's and turned back into pixels at the disc's resting size.
  const worst = Math.max(...out.map((f) => Math.hypot(f.x - base.x, f.y - base.y) * base.radius)) / DPR;
  return { worst, frames: out.length };
}

const fixed = await drift(null);
const control = await drift(UNFIX);
console.log(`rail disc hover: letter moved at most ${fixed.worst.toFixed(2)}px against its disc over ${fixed.frames} frames (control without the fix: ${control.worst.toFixed(2)}px)`);
if (!(control.worst > 1.1)) fail(`control: with the fix stripped the letter moved only ${control.worst.toFixed(2)}px, so this measurement cannot see the bug`);
if (fixed.worst > 0.7) fail(`the letter moves ${fixed.worst.toFixed(2)}px against its disc while it grows on hover`);

// Drawings grow inside their SVG, and nothing that grows is on a layer of its own.
const audit = (page) =>
  page.evaluate(() => {
    const scales = (el) => /(^|\s)(group-)?(hover|active):scale-|data-\[active\]:scale-|data-\[popup-open\]:scale-/.test(el.getAttribute('class') ?? '');
    const name = (el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent).trim().slice(0, 30)}"`;
    const all = [...document.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().width > 0);
    return {
      wrapped: all.filter((el) => scales(el) && el.querySelector('svg [data-initial]')).map(name),
      texts: all.filter((el) => el.matches('text[data-initial]')).map((el) => `"${el.textContent}"`),
      initials: all.filter((el) => el.matches('path[data-initial]')).length,
      hollow: all.filter((el) => el.hasAttribute('data-grows') && !el.querySelector('[data-grow]')).map(name),
      layered: all
        .filter((el) => scales(el) || el.hasAttribute('data-grows') || el.hasAttribute('data-grow'))
        .filter((el) => /transform|scale/.test(getComputedStyle(el).willChange))
        .map(name),
      drawings: all.filter((el) => el.hasAttribute('data-grows')).length,
    };
  });
{
  const { ctx, page } = await signedIn();
  const room = await audit(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const landing = await audit(page);
  await ctx.close();
  const list = (k) => [...new Set([...room[k], ...landing[k]])];
  if (list('wrapped').length) fail(`boxes that scale with a drawn initial inside: ${list('wrapped').slice(0, 6).join('; ')}`);
  if (list('hollow').length) fail(`data-grows with nothing inside that grows: ${list('hollow').slice(0, 6).join('; ')}`);
  if (list('layered').length) fail(`growing elements on a layer of their own: ${list('layered').slice(0, 6).join('; ')}`);
  if (list('texts').length) fail(`initials set as text, not drawn: ${list('texts').slice(0, 6).join(', ')}`);
  if (room.initials < 5 || landing.initials < 5) fail(`too few initials drawn as outlines (${room.initials} in the room, ${landing.initials} on the landing)`);
  if (room.drawings < 4 || landing.drawings < 3) fail(`too few growing drawings found (${room.drawings} in the room, ${landing.drawings} on the landing)`);
  console.log(
    `${room.drawings} growing drawings in the room and ${landing.drawings} on the landing grow inside their SVG; no box around a drawn initial scales, nothing that grows is on a layer, and all ${room.initials + landing.initials} initials are outlines`,
  );
}

await browser.close();
console.log('STEADY_LETTERS_OK');
