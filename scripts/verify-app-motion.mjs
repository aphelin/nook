// Polish G8: the app's micro-interactions land where they should, measured in a real browser.
// The current-channel pill is caught on its way between rows and then sits exactly on the row you
// picked (and the row gives up its own fill to it); the shape picker's preview is caught mid-morph
// and ends as the shape you chose (rasterised overlap with the real path); under reduced motion
// both land at once. Signs in with the one-click demo; nothing is saved.
//
//   node scripts/verify-app-motion.mjs [base url]
import { chromium } from '@playwright/test';
import { fail } from './lib.mjs';

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
const errors = [];

async function signIn(reducedMotion) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /try the demo|open nook/i }).first().click();
  await page.waitForURL(/\/app\/[^/]+\/[^/]+/, { timeout: 20000 });
  await page.getByRole('navigation', { name: /channels$/ }).waitFor();
  await page.waitForTimeout(800);
  return { ctx, page };
}

/** The pill and the current row, as boxes, plus whether the row still paints its own fill. */
const pillState = (page) =>
  page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label$="channels"]');
    const pill = nav.querySelector('[data-current-pill]').getBoundingClientRect();
    const row = nav.querySelector('[aria-current="page"]');
    const r = row.getBoundingClientRect();
    return {
      pill: [pill.left, pill.top, pill.width, pill.height],
      row: [r.left, r.top, r.width, r.height],
      rowFill: getComputedStyle(row).backgroundColor,
      sliding: nav.querySelector('[data-sliding]') !== null,
      name: row.textContent.trim(),
    };
  });
const sameBox = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 1);

/** Overlap between the preview's current outline and the named shape's real path. */
const previewMatches = (page, shape) =>
  page.evaluate((shape) => {
    const preview = document.querySelector('svg[data-shape]');
    const path = preview.querySelector('path');
    const target = document.querySelector(`input[name="face-shape"][value="${shape}"]`).closest('label').querySelector('path');
    const pt = preview.createSVGPoint();
    let both = 0;
    let either = 0;
    for (let y = 0.25; y < 40; y += 0.5)
      for (let x = 0.25; x < 40; x += 0.5) {
        pt.x = x;
        pt.y = y;
        const a = path.isPointInFill(pt);
        const b = target.isPointInFill(pt);
        both += a && b ? 1 : 0;
        either += a || b ? 1 : 0;
      }
    return { overlap: both / either, attr: preview.dataset.shape };
  }, shape);

async function openEditor(page) {
  await page.getByRole('button', { name: /^Account:/ }).click();
  await page.getByRole('menuitem', { name: 'Edit profile' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit profile' });
  await dialog.waitFor();
  await page.waitForTimeout(400);
  return dialog;
}

// Full motion.
{
  const { ctx, page } = await signIn('no-preference');
  const before = await pillState(page);
  if (!before.sliding || !sameBox(before.pill, before.row)) fail(`the pill does not start on the current row: ${JSON.stringify(before)}`);
  if (!/rgba\(0, 0, 0, 0\)|transparent/.test(before.rowFill)) fail(`the current row still paints its own fill (${before.rowFill}) under the pill`);
  const target = page.getByRole('navigation', { name: /channels$/ }).getByRole('link', { name: /beta-spray|trip-planning|gear-swap/ }).last();
  await target.click();
  // Time the slide from when the route has actually changed rows, not from the click.
  await page.waitForFunction((name) => document.querySelector('nav[aria-label$="channels"] [aria-current="page"]')?.textContent.trim() !== name, before.name);
  await page.waitForTimeout(90);
  const moving = await pillState(page);
  await page.waitForTimeout(900);
  const after = await pillState(page);
  if (after.name === before.name) fail('clicking another channel did not change the current row');
  if (sameBox(moving.pill, after.row) || sameBox(moving.pill, before.row)) fail(`the pill jumped instead of travelling (at 90ms it sat at ${JSON.stringify(moving.pill)})`);
  if (!sameBox(after.pill, after.row)) fail(`the pill did not land on the row you picked: pill ${JSON.stringify(after.pill)} row ${JSON.stringify(after.row)}`);
  console.log(`pill: travelled from #${before.name} to #${after.name} and sits on it`);

  // Whoever is here wears a ring grown out from them: it must end centred on the person.
  const rings = await page.evaluate(() => {
    const centre = (el) => {
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    };
    return [...document.querySelectorAll('[aria-label="Who\'s here"] svg[data-face]')]
      .map((svg) => ({ ring: svg.querySelector("path[fill='none']"), face: svg.querySelector('path:not([fill])') ?? svg.querySelectorAll('path')[1] }))
      .filter((x) => x.ring && x.face)
      .map(({ ring, face }) => {
        const [a, b] = [centre(ring), centre(face)];
        return Math.hypot(a[0] - b[0], a[1] - b[1]);
      });
  });
  if (!rings.length) fail("no ringed person in the who's-here strip to measure");
  // Control: the measurement sees an offset when there is one (a person against the rail's foot).
  const control = await page.evaluate(() => {
    const a = document.querySelector('[aria-label="Who\'s here"] svg[data-face]').getBoundingClientRect();
    const b = document.querySelector('nav[aria-label$="channels"]').getBoundingClientRect();
    return Math.hypot(a.left - b.left, a.top - b.top);
  });
  if (!(control > 5)) fail('control: the centring measurement cannot see an offset');
  const off = Math.max(...rings);
  if (off > 0.75) fail(`a presence ring sits ${off.toFixed(2)}px off its person`);
  console.log(`rings: ${rings.length} centred on their people (worst ${off.toFixed(2)}px)`);

  const dialog = await openEditor(page);
  const start = await page.evaluate(() => document.querySelector('svg[data-shape]').dataset.shape);
  const pickShape = start === 'crown' ? 'burst' : 'crown';
  // Every frame from the click on: a morph has frames that are neither the old shape nor the new one.
  const frames = await page.evaluate(
    ([from, to]) =>
      new Promise((done) => {
        const preview = document.querySelector('svg[data-shape]');
        const path = preview.querySelector('path');
        const shapeOf = (name) => document.querySelector(`input[name="face-shape"][value="${name}"]`).closest('label').querySelector('path');
        const [a, b] = [shapeOf(from), shapeOf(to)];
        const pt = preview.createSVGPoint();
        const overlap = (target) => {
          let both = 0;
          let either = 0;
          for (let y = 0.5; y < 40; y += 1)
            for (let x = 0.5; x < 40; x += 1) {
              pt.x = x;
              pt.y = y;
              const p = path.isPointInFill(pt);
              const t = target.isPointInFill(pt);
              both += p && t ? 1 : 0;
              either += p || t ? 1 : 0;
            }
          return both / either;
        };
        const out = [];
        const t0 = performance.now();
        const tick = () => {
          out.push([Math.round(performance.now() - t0), overlap(a), overlap(b)]);
          if (performance.now() - t0 < 900) requestAnimationFrame(tick);
          else done(out);
        };
        b.closest('label').click();
        requestAnimationFrame(tick);
      }),
    [start, pickShape],
  );
  const between = frames.filter(([, a, b]) => a < 0.95 && b < 0.95);
  const [, , endOverlap] = frames.at(-1);
  const attr = await page.evaluate(() => document.querySelector('svg[data-shape]').dataset.shape);
  if (!between.length) fail(`the preview jumped: no frame between ${start} and ${pickShape} in ${frames.length} frames`);
  if (!(endOverlap >= 0.97) || attr !== pickShape) fail(`the preview did not end as ${pickShape} (overlap ${endOverlap.toFixed(3)}, shape ${attr})`);
  console.log(`morph: ${start} → ${pickShape}, ${between.length} of ${frames.length} frames in between, ${endOverlap.toFixed(3)} when settled`);

  // Smooth: a second pick, timed on its own (the overlap sampler above is heavy enough to skew frames).
  const pacing = await page.evaluate(
    (name) =>
      new Promise((done) => {
        const label = document.querySelector(`input[name="face-shape"][value="${name}"]`).closest('label');
        const deltas = [];
        let last = performance.now();
        const t0 = last;
        const tick = (t) => {
          deltas.push(t - last);
          last = t;
          if (t - t0 < 650) requestAnimationFrame(tick);
          else done(deltas.sort((a, b) => a - b));
        };
        label.click();
        requestAnimationFrame(tick);
      }),
    pickShape === 'burst' ? 'leaf' : 'burst',
  );
  const morph95 = pacing[Math.floor(pacing.length * 0.95)];
  if (morph95 > 20) fail(`the morph stutters: frames p95 ${morph95.toFixed(1)}ms > 20ms`);
  console.log(`morph pacing: p95 frame ${morph95.toFixed(1)}ms over ${pacing.length} frames`);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await ctx.close();
}

// Reduced motion: both land at once.
{
  const { ctx, page } = await signIn('reduce');
  const before = await pillState(page);
  await page.getByRole('navigation', { name: /channels$/ }).getByRole('link', { name: /beta-spray|trip-planning|gear-swap/ }).first().click();
  await page.waitForFunction((name) => document.querySelector('nav[aria-label$="channels"] [aria-current="page"]')?.textContent.trim() !== name, before.name);
  await page.waitForTimeout(60);
  const after = await pillState(page);
  if (!sameBox(after.pill, after.row)) fail(`reduced motion: the pill was not on the new row at once: ${JSON.stringify(after)}`);
  const dialog = await openEditor(page);
  const start = await page.evaluate(() => document.querySelector('svg[data-shape]').dataset.shape);
  const pickShape = start === 'hex' ? 'leaf' : 'hex';
  await dialog.getByRole('radio', { name: pickShape === 'hex' ? 'Hexagon' : 'Leaf' }).check({ force: true });
  await page.waitForTimeout(80);
  const now = await previewMatches(page, pickShape);
  if (!(now.overlap >= 0.97)) fail(`reduced motion: the preview was not ${pickShape} at once (overlap ${now.overlap.toFixed(3)})`);
  console.log('reduced motion: pill and preview landed at once');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await ctx.close();
}

await browser.close();
if (errors.length) fail(`page errors:\n${errors.slice(0, 5).join('\n')}`);
console.log('APP_MOTION_OK');
