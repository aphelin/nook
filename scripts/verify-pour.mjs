// Round 3 R8 / round 4 S2: switching nooks pours the new club's colour over the screen, as liquid.
// In a real browser, in both colour schemes: picking another nook on the rail runs a view
// transition in which the paint (a WebGL canvas with a view-transition name of its own, or three
// clip-path layers where WebGL is missing) comes down from the top-left and the new room is
// uncovered behind it. Frozen part way, and read pixel by pixel against shots of the room before and
// after: the top-left is already the new room or paint while the bottom-right is still the old
// room; the paint between them is the new club's paint colour (its room's highlight, as the new
// page resolves it); its front has drips (at least two tongues hanging 25px or more below the edge
// around them); later frames have covered more than earlier ones; and the paint is alive, not a
// fixed shape moving: some drip lets a drop go (a blob of paint cut off from the rest, seen at one
// of three moments). It starts within 400ms of the click on one clock; drawn with the machine's
// GPU, as its people see it, every frame while the paint moves comes within 50ms of the one before
// and there are at least 20 of them (a screencast); it ends on the new nook with nothing left
// behind (no paint, no turn attribute), the landing's club picker pours the same way, nothing turns
// (no rotation anywhere in the story turn), and under reduced motion the switch is a plain cut.
//
//   node scripts/verify-pour.mjs [base url]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { clearDemoLimit, fail, root } from './lib.mjs';

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';

const css = readFileSync(join(root, 'apps/web/src/app/globals.css'), 'utf8');
const turnTs = readFileSync(join(root, 'apps/web/src/components/shell/story-turn.ts'), 'utf8');
if (/turn-(in|out)-(next|prev)|rotateY/.test(css + turnTs)) fail('the cube (a turn keyframe or rotateY) is still in the story turn');

// With the machine's GPU, as the people using it have: the liquid is a full-screen shader, and a
// CPU drawing WebGL (SwiftShader) is not what anyone switching nooks is looking at.
const browser = await chromium.launch({ args: ['--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const errors = [];

async function signedIn(scheme, reducedMotion = 'no-preference') {
  clearDemoLimit();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme, reducedMotion });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /try the demo|open nook/i }).first().click();
  await page.waitForURL(/\/app\/[^/]+\/[^/]+/, { timeout: 30000 });
  await page.waitForTimeout(2000);
  return { ctx, page };
}

const pourAnimations = () =>
  document.getAnimations().filter((a) => a.effect?.pseudoElement === '::view-transition-new(root)' || a.effect?.target?.closest?.('[data-paint="layers"]'));

/** Classifies a grid of points in a shot as old room, new room or paint (by the nearest of the three). */
async function classify(page, shots) {
  return page.evaluate(async ({ shots }) => {
    const load = async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      return { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
    };
    const old = await load(shots.old);
    const now = await load(shots.now);
    const after = await load(shots.after);
    const [pr, pg, pb] = shots.paint;
    const STEP = 8;
    const cells = [];
    for (let y = 4; y < old.h; y += STEP)
      for (let x = 4; x < old.w; x += STEP) {
        const i = (y * old.w + x) * 4;
        const dist = (img) => Math.hypot(now.d[i] - img.d[i], now.d[i + 1] - img.d[i + 1], now.d[i + 2] - img.d[i + 2]);
        const toPaint = Math.hypot(now.d[i] - pr, now.d[i + 1] - pg, now.d[i + 2] - pb);
        const toOld = dist(old);
        const toNew = dist(after);
        // Where old and new look alike, the point says nothing.
        const same = Math.hypot(old.d[i] - after.d[i], old.d[i + 1] - after.d[i + 1], old.d[i + 2] - after.d[i + 2]) < 24;
        const kind = toPaint < 40 && toPaint < toOld && toPaint < toNew ? 'paint' : same ? 'same' : toOld <= toNew ? 'old' : 'new';
        cells.push({ x, y, kind });
      }
    return { cells, w: old.w, h: old.h, step: STEP };
  }, { shots });
}

async function pour(scheme) {
  const { ctx, page } = await signedIn(scheme);
  const shot = async () => (await page.screenshot()).toString('base64');
  const before = await shot();
  // The pour's layers, and when it started relative to the click.
  const target = page.locator('nav[aria-label="Nooks"] li a:not([aria-current])').first();
  await target.hover();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    document.addEventListener('click', () => (window.__clickAt = performance.now()), { capture: true, once: true });
  });
  await target.click();
  await page.waitForFunction(
    () => {
      const kind = document.querySelector('[data-paint]')?.dataset.paint;
      const runs = document.getAnimations().filter((a) => a.effect?.pseudoElement === '::view-transition-new(root)' || a.effect?.target?.closest?.('[data-paint="layers"]'));
      return runs.length === (kind === 'liquid' ? 1 : 4) && runs.every((a) => a.startTime !== null && a.playState === 'running');
    },
    null,
    { timeout: 5000, polling: 'raf' },
  );
  const info = await page.evaluate((src) => {
    const runs = eval(src)();
    runs.forEach((a) => a.pause());
    // The paint is the new room's highlight, as the new page resolves it in this scheme.
    const probe = document.createElement('span');
    probe.style.color = 'var(--stage-hi)';
    document.body.append(probe);
    const paint = getComputedStyle(probe).color;
    probe.remove();
    return { kind: document.querySelector('[data-paint]').dataset.paint, starts: runs.map((a) => a.startTime), duration: runs[0].effect.getTiming().duration, lag: runs[0].startTime - window.__clickAt, paint };
  }, `(${pourAnimations.toString()})`);
  if (new Set(info.starts.map((s) => Math.round(s))).size !== 1) fail(`${scheme}: the pour's layers are not on one clock (${info.starts.join(', ')})`);
  console.log(`${scheme}: the paint is ${info.kind === 'liquid' ? 'liquid (WebGL)' : 'clip-path layers (no WebGL)'}`);
  if (info.lag > 400) fail(`${scheme}: the pour started ${info.lag.toFixed(0)}ms after the click`);
  const paint = info.paint.match(/\d+/g).slice(0, 3).map(Number);
  const frozen = {};
  for (const f of [0.3, 0.5, 0.6, 0.7]) {
    await page.evaluate(
      ([src, f]) => {
        eval(src)().forEach((a) => (a.currentTime = f * a.effect.getTiming().duration));
        // The liquid keeps its own clock in a worker: hold it at the same moment.
        window.dispatchEvent(new CustomEvent('nook:pour-hold', { detail: f }));
      },
      [`(${pourAnimations.toString()})`, f],
    );
    await page.waitForTimeout(150);
    frozen[f] = await shot();
  }
  await page.evaluate((src) => eval(src)().forEach((a) => a.play()), `(${pourAnimations.toString()})`);
  await page.waitForFunction(() => !document.documentElement.dataset.turn, null, { timeout: 5000 });
  await page.waitForTimeout(600);
  const after = await shot();
  const left = await page.evaluate(() => ({ coat: !!document.querySelector('[data-paint]'), turn: document.documentElement.dataset.turn ?? null, url: location.pathname }));
  if (left.coat || left.turn) fail(`${scheme}: the pour left something behind (${JSON.stringify(left)})`);

  const covered = [];
  let drops = 0;
  for (const f of [0.3, 0.5, 0.6, 0.7]) {
    const { cells, w, h, step } = await classify(page, { old: before, now: frozen[f], after, paint });
    const at = (x0, y0, x1, y1) => cells.filter((c) => c.x >= x0 && c.x < x1 && c.y >= y0 && c.y < y1 && c.kind !== 'same');
    const tl = at(0, 0, w * 0.25, h * 0.25);
    const br = at(w * 0.75, h * 0.75, w, h);
    const share = (list, kinds) => list.filter((c) => kinds.includes(c.kind)).length / Math.max(1, list.length);
    const paintCells = cells.filter((c) => c.kind === 'paint').length;
    covered.push(share(cells.filter((c) => c.kind !== 'same'), ['new', 'paint']));
    // Drops: small blobs of paint cut off from the rest (at least two points, fewer than 60).
    if (f >= 0.5) {
      const key = (c) => `${c.x},${c.y}`;
      const paintAt = new Map(cells.filter((c) => c.kind === 'paint' || c.kind === 'new').map((c) => [key(c), c]));
      const seen = new Set();
      for (const c of paintAt.values()) {
        if (seen.has(key(c)) || c.kind !== 'paint') continue;
        const stack = [c];
        let size = 0;
        seen.add(key(c));
        while (stack.length) {
          const n = stack.pop();
          size += 1;
          for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
            const k = `${n.x + dx},${n.y + dy}`;
            if (paintAt.has(k) && !seen.has(k)) {
              seen.add(k);
              stack.push(paintAt.get(k));
            }
          }
        }
        if (size >= 2 && size < 60) drops += 1;
      }
    }
    if (f === 0.5) {
      if (share(tl, ['new', 'paint']) < 0.9) fail(`${scheme}: half-way, the top-left is not yet painted (${(share(tl, ['new', 'paint']) * 100).toFixed(0)}%)`);
      if (share(br, ['old']) < 0.9) fail(`${scheme}: half-way, the bottom-right is already painted (${(share(br, ['old']) * 100).toFixed(0)}% old)`);
      if (paintCells < 150) fail(`${scheme}: half-way, only ${paintCells} points are the club's paint colour`);
      // The front: for each column, the lowest painted point. Drips are tongues hanging below the edge around them.
      const cols = new Map();
      for (const c of cells) if (c.kind === 'paint' || c.kind === 'new') cols.set(c.x, Math.max(cols.get(c.x) ?? -1, c.y));
      const xs = [...cols.keys()].sort((a, b) => a - b);
      let drips = 0;
      let inDrip = false;
      for (const x of xs) {
        const around = xs.filter((o) => Math.abs(o - x) <= 80 && Math.abs(o - x) >= 24).map((o) => cols.get(o));
        const sorted = around.sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const hanging = cols.get(x) - median >= 25 && cols.get(x) < h - step;
        if (hanging && !inDrip) drips += 1;
        inDrip = hanging;
      }
      if (drips < 2) fail(`${scheme}: half-way, the paint's front has ${drips} drips`);
      console.log(`${scheme}: half-way the top-left is painted, the bottom-right still the old room, ${paintCells} points of paint between, ${drips} drips on its front`);
    }
  }
  if (!(covered[0] < covered[1] && covered[1] < covered[2] && covered[2] < covered[3])) fail(`${scheme}: the paint does not keep covering more (${covered.map((c) => c.toFixed(2)).join(', ')})`);
  if (!drops) fail(`${scheme}: no drop fell away from the paint at any of three moments (a fixed shape sliding, not a liquid)`);
  console.log(`${scheme}: ${drops} drops seen falling free of the paint`);
  console.log(`${scheme}: covered ${covered.map((c) => `${(c * 100).toFixed(0)}%`).join(' → ')}; began ${info.lag.toFixed(0)}ms after the click; ended on ${left.url}`);
  await ctx.close();
}

await pour('dark');
await pour('light');

// Every frame of a real pour, from the compositor: none more than 50ms after the one before.
{
  const { ctx, page } = await signedIn('dark');
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ t: f.metadata.timestamp * 1000, data: f.data });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId });
  });
  const target = page.locator('nav[aria-label="Nooks"] li a:not([aria-current])').first();
  await target.hover();
  await page.waitForTimeout(500);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 40, maxWidth: 640, maxHeight: 400, everyNthFrame: 1 });
  await page.waitForTimeout(200);
  await target.click();
  const window_ = await page.evaluate(
    () =>
      new Promise((done) => {
        const check = () => {
          const run = document.getAnimations().find((a) => a.effect?.pseudoElement === '::view-transition-new(root)' && a.startTime !== null && a.playState === 'running');
          if (run) done({ start: run.startTime + performance.timeOrigin, ms: run.effect.getTiming().duration });
          else requestAnimationFrame(check);
        };
        check();
      }),
  );
  await page.waitForTimeout(1400);
  await cdp.send('Page.stopScreencast');
  const distinct = frames.filter((f, i) => i === 0 || f.data !== frames[i - 1].data);
  // While the paint is moving on screen: by 85% of the pour it has run off the last corner, and a
  // screen that no longer changes sends no frames.
  const during = distinct.filter((f) => f.t >= window_.start && f.t <= window_.start + window_.ms * 0.85);
  const gaps = during.slice(1).map((f, i) => f.t - during[i].t);
  const worst = Math.max(...gaps);
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl ? String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : 'none';
  });
  console.log(`renderer: ${renderer}`);
  if (/swiftshader|llvmpipe|software/i.test(renderer)) fail('the pacing needs this machine\'s GPU, and the browser fell back to drawing WebGL on the CPU');
  if (during.length < 20) fail(`only ${during.length} distinct frames were drawn during the pour`);
  if (worst > 50) fail(`a ${worst.toFixed(0)}ms gap between frames during the pour`);
  console.log(`pacing: ${during.length} frames during the pour, the longest gap ${worst.toFixed(0)}ms`);
  await ctx.close();
}

// The landing's club picker pours too.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('group', { name: 'Try another club' }).getByRole('button', { name: 'Dog-Eared' }).click();
  const poured = await page
    .waitForFunction(() => !!document.querySelector('[data-paint]') && document.getAnimations().some((a) => a.effect?.pseudoElement === '::view-transition-new(root)'), null, { timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (!poured) fail('a club pick on the landing does not pour');
  await page.waitForFunction(() => !document.documentElement.dataset.turn && !document.querySelector('[data-paint]'), null, { timeout: 5000 });
  console.log('landing: a club pick pours the same way and cleans up');
  await page.close();
}

// Reduced motion: a plain cut.
{
  const { ctx, page } = await signedIn('dark', 'reduce');
  await page.evaluate(() => {
    window.__transitions = 0;
    const start = document.startViewTransition?.bind(document);
    if (start) document.startViewTransition = (u) => ((window.__transitions += 1), start(u));
  });
  const before = page.url();
  await page.locator('nav[aria-label="Nooks"] li a:not([aria-current])').first().click();
  await page.waitForFunction((u) => location.href !== u, before, { timeout: 10000 });
  await page.waitForTimeout(400);
  const n = await page.evaluate(() => window.__transitions);
  if (n) fail(`under reduced motion the switch ran ${n} view transitions`);
  console.log('reduced motion: the switch is a plain cut');
  await ctx.close();
}

await browser.close();
if (errors.length) fail(`page errors:\n${errors.slice(0, 5).join('\n')}`);
console.log('POUR_OK');
