// Round 3 R14: the small things measured, in a real browser. The Private switch's knob sits centred
// in its track (equal gaps above and below, 4px from the end it rests at, in both states). The
// person card's band hugs the person's own shape (the same path, stroked; the card's colour 3px
// outside the outline all round). Every presence mark touches its person's shape (no more than 1px
// from the outline). Reactions show every face: each person drawn in a reaction chip stands out
// from the chip (at least 1.5:1). The emoji grid sits centred in its picker (the side gaps within
// 2px). A disabled send button dims its arrow. By night, cards lifted over the wing carry an edge.
// On a phone, "Start a nook" and sign-up with a long name never scroll sideways, a direct message's
// title stops short of the search button, and the landing's reply pill fits on the screen.
//
//   node scripts/verify-details.mjs [base url]
import { chromium } from '@playwright/test';
import { clearDemoLimit, fail } from './lib.mjs';

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
const errors = [];

async function signedIn(options = {}) {
  clearDemoLimit();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /try the demo|open nook/i }).first().click();
  await page.waitForURL(/\/app\/[^/]+\/[^/]+/, { timeout: 30000 });
  await page.waitForTimeout(1800);
  return { ctx, page };
}

// In-page helpers: WCAG contrast of two computed colours, and a path's outline on screen.
const HELPERS = `
  window.__lum = (css) => { const [r, g, b] = css.match(/\\d+(\\.\\d+)?/g).slice(0, 3).map((v) => { const c = Number(v) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  window.__contrast = (a, b) => { const [x, y] = [__lum(a), __lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  window.__outline = (path, n = 96) => { const m = path.getScreenCTM(); const L = path.getTotalLength(); return Array.from({ length: n }, (_, i) => { const p = path.getPointAtLength((L * i) / n); return [m.a * p.x + m.c * p.y + m.e, m.b * p.x + m.d * p.y + m.f]; }); };
`;

// 1. The Private switch.
{
  const { ctx, page } = await signedIn();
  await page.addScriptTag({ content: HELPERS });
  await page.getByRole('button', { name: 'New channel' }).click();
  const sw = page.getByRole('switch');
  await sw.waitFor();
  await page.waitForTimeout(500);
  const gaps = () =>
    page.evaluate(() => {
      const r = document.querySelector('[role="switch"]').getBoundingClientRect();
      const t = document.querySelector('[role="switch"] > *').getBoundingClientRect();
      return { top: t.top - r.top, bottom: r.bottom - t.bottom, left: t.left - r.left, right: r.right - t.right };
    });
  const off = await gaps();
  await sw.click();
  await page.waitForTimeout(400);
  const on = await gaps();
  const centred = (g) => Math.abs(g.top - g.bottom) <= 0.5 && g.top >= 0 && g.bottom >= 0;
  if (!centred(off) || Math.abs(off.left - 4) > 0.5) fail(`the switch's knob is off-centre when off: ${JSON.stringify(off)}`);
  if (!centred(on) || Math.abs(on.right - 4) > 0.5) fail(`the switch's knob is off-centre when on: ${JSON.stringify(on)}`);
  console.log(`switch: knob centred (${off.top.toFixed(1)}/${off.bottom.toFixed(1)}), 4px from the end it rests at, off and on`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 2. The person card's band, on someone who is not a circle.
  await page.locator('main ul[aria-label="Who\'s here"] button:has(svg[data-face]:not([data-face="circle"]))').first().click();
  await page.waitForTimeout(600);
  const band = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.surface-card')].find((c) => c.querySelector('.surface-stage.h-20'));
    const face = card.querySelector('svg[data-face]');
    const shape = face.querySelector('path');
    const bandPath = card.querySelector('svg:not([data-face]) path[style*="stroke"]');
    return { same: !!bandPath && bandPath.getAttribute('d') === shape.getAttribute('d'), face: face.dataset.face, bg: getComputedStyle(card).backgroundColor };
  });
  if (!band.same) fail(`the person card's band is not drawn from the person's own shape (${band.face})`);
  const shot = await page.screenshot();
  const outside = await page.evaluate(
    async ({ b64 }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const card = [...document.querySelectorAll('.surface-card')].find((x) => x.querySelector('.surface-stage.h-20'));
      const shape = card.querySelector('svg[data-face] path');
      const pts = __outline(shape);
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const bg = card.querySelector('.px-5') ?? card;
      const [r0, g0, b0] = getComputedStyle(card).backgroundColor.match(/\d+/g).map(Number);
      // The presence mark sits at the bottom-right: skip the outline near it.
      const dot = card.querySelector('svg[role="img"]').getBoundingClientRect();
      let off = 0;
      let n = 0;
      pts.forEach(([x, y], i) => {
        const [px, py] = pts[(i + 1) % pts.length];
        let nx = py - y;
        let ny = x - px;
        const len = Math.hypot(nx, ny) || 1;
        nx /= len;
        ny /= len;
        if ((x + nx - cx) ** 2 + (y + ny - cy) ** 2 < (x - cx) ** 2 + (y - cy) ** 2) {
          nx = -nx;
          ny = -ny;
        }
        const sx = Math.round(x + nx * 3);
        const sy = Math.round(y + ny * 3);
        if (sx > dot.left - 4 && sx < dot.right + 4 && sy > dot.top - 4 && sy < dot.bottom + 4) return;
        const d = g.getImageData(sx, sy, 1, 1).data;
        n += 1;
        if (Math.hypot(d[0] - r0, d[1] - g0, d[2] - b0) > 16) off += 1;
      });
      void bg;
      return { off, n };
    },
    { b64: shot.toString('base64') },
  );
  if (outside.off > outside.n * 0.05) fail(`the band is missing 3px outside the ${band.face}'s outline at ${outside.off} of ${outside.n} points`);
  console.log(`person card: the band is the ${band.face}'s own outline, the card's colour 3px outside it at ${outside.n - outside.off} of ${outside.n} points`);

  // 3. Every presence mark touches its person (the card's, and everyone's in the room and the lists).
  const dots = await page.evaluate(() => {
    const out = [];
    for (const mark of document.querySelectorAll('svg[role="img"][aria-label]')) {
      const face = mark.parentElement?.querySelector('svg[data-face] path');
      if (!face || !mark.closest('span.relative')) continue;
      const r = mark.getBoundingClientRect();
      if (!r.width) continue;
      const c = [r.left + r.width / 2, r.top + r.height / 2];
      const pts = __outline(face, 160);
      const gap = Math.min(...pts.map(([x, y]) => Math.hypot(x - c[0], y - c[1]))) - r.width / 2;
      out.push({ gap, face: face.closest('svg').dataset.face });
    }
    return out;
  });
  const far = dots.filter((d) => d.gap > 1);
  if (!dots.length) fail('no presence marks found to measure');
  if (far.length) fail(`${far.length} presence marks float off their person: ${far.slice(0, 4).map((d) => `${d.face} ${d.gap.toFixed(1)}px`).join(', ')}`);
  console.log(`presence: all ${dots.length} marks touch their person's shape (the furthest ${Math.max(...dots.map((d) => d.gap)).toFixed(1)}px)`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 4. Reactions show every face.
  const faces = await page.evaluate(() =>
    [...document.querySelectorAll('main button[aria-pressed]')].flatMap((chip) =>
      [...chip.querySelectorAll('svg[data-face] path')].map((p) => ({ c: __contrast(getComputedStyle(p).fill, getComputedStyle(chip).backgroundColor), chip: chip.getAttribute('aria-label') })),
    ),
  );
  const hidden = faces.filter((f) => f.c < 1.5);
  if (!faces.length) fail('no faces in reaction chips to measure');
  if (hidden.length) fail(`${hidden.length} faces vanish into their reaction chip: ${hidden.slice(0, 3).map((h) => `${h.chip} (${h.c.toFixed(2)}:1)`).join('; ')}`);
  console.log(`reactions: all ${faces.length} faces stand out from their chips (the faintest ${Math.min(...faces.map((f) => f.c)).toFixed(2)}:1)`);

  // 5. The emoji grid, centred in its picker.
  const row = page.locator('main article[data-message-id]').nth(-2);
  await row.hover();
  await row.getByRole('button', { name: 'Add a reaction' }).click();
  await page.waitForTimeout(700);
  const grid = await page.evaluate(() => {
    const pop = document.querySelector('[role="dialog"] [frimousse-list], [frimousse-list]')?.closest('[role="dialog"]') ?? document.querySelector('[role="dialog"]');
    const box = pop.getBoundingClientRect();
    const buttons = [...pop.querySelectorAll('button[aria-label]')].filter((b) => b.getBoundingClientRect().width && b.checkVisibility({ visibilityProperty: true }) && b.getBoundingClientRect().top > box.top);
    const top = Math.min(...buttons.map((b) => b.getBoundingClientRect().top));
    const first = buttons.filter((b) => Math.abs(b.getBoundingClientRect().top - top) < 2).map((b) => b.getBoundingClientRect());
    return { left: Math.min(...first.map((r) => r.left)) - box.left, right: box.right - Math.max(...first.map((r) => r.right)), n: first.length };
  });
  if (Math.abs(grid.left - grid.right) > 2) fail(`the emoji grid is off-centre: ${grid.left.toFixed(1)}px left, ${grid.right.toFixed(1)}px right`);
  console.log(`emoji: ${grid.n} to a row, ${grid.left.toFixed(1)}px either side`);
  await page.keyboard.press('Escape');

  // 6. A disabled send button dims its arrow.
  const arrow = async () => page.evaluate(() => Number(getComputedStyle(document.querySelector('button[type="submit"][aria-label*="Send"] svg')).opacity));
  const composer = page.getByRole('textbox', { name: /message/i }).first();
  await composer.fill('');
  await page.waitForTimeout(200);
  const empty = await arrow();
  await composer.fill('hello');
  await page.waitForTimeout(200);
  const typed = await arrow();
  await composer.fill('');
  if (!(empty < 0.6 && typed === 1)) fail(`the send arrow does not dim while it cannot send (${empty} empty, ${typed} typed)`);
  console.log(`send: the arrow is at ${empty} while there is nothing to send, ${typed} once there is`);
  await ctx.close();
}

// 7. By night, a card over the wing has an edge.
{
  const { ctx, page } = await signedIn({ colorScheme: 'dark' });
  await page.getByRole('button', { name: 'Invite people' }).click();
  await page.waitForTimeout(500);
  const shadow = await page.evaluate(() => getComputedStyle([...document.querySelectorAll('.surface-card')].at(-1)).boxShadow);
  if (!/0px 0px 0px 1px/.test(shadow)) fail(`a night card over the wing has no edge (box-shadow: ${shadow})`);
  console.log('night: a card over the wing carries its 1px edge');
  await ctx.close();
}

// 8. Phones.
{
  const { ctx, page } = await signedIn({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const sideways = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  // A direct message's title stops short of the search button.
  await page.getByRole('button', { name: 'Open channels' }).click();
  await page.waitForTimeout(600);
  const dm = page.locator('[role="dialog"] nav[aria-label$="channels"] a[href*="/app/"]:has(svg[data-face])').first();
  {
    await dm.click();
    await page.waitForTimeout(1500);
    const title = await page.evaluate(() => {
      const t = document.querySelector('main .room-title');
      const search = [...document.querySelectorAll('main button')].find((b) => /search/i.test(b.getAttribute('aria-label') ?? ''));
      return { right: t.getBoundingClientRect().right, stop: search?.getBoundingClientRect().left ?? innerWidth };
    });
    if (title.right > title.stop) fail(`on a phone the direct message's title runs under the search button (${title.right.toFixed(0)} > ${title.stop.toFixed(0)})`);
    console.log('phone: a direct message title stops short of the search button');
  }
  await page.goto(`${BASE}/app/new`, { waitUntil: 'networkidle' });
  if ((await sideways()) > 0) fail(`on a phone "Start a nook" scrolls sideways by ${await sideways()}px`);
  await ctx.close();
  const anon = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await anon.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
  await anon.getByLabel('Display name').fill('Averylongname-Hyphenated-Withnobreaks');
  await anon.waitForTimeout(300);
  const over = await anon.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (over > 0) fail(`on a phone sign-up with a long name scrolls sideways by ${over}px`);
  await anon.goto(BASE, { waitUntil: 'networkidle' });
  const pill = await anon.evaluate(() => {
    const p = document.querySelector('[data-arrive="pill"]');
    const r = p.getBoundingClientRect();
    return { right: r.right, height: r.height, width: innerWidth };
  });
  if (pill.right > pill.width || pill.height > 60) fail(`on a phone the landing's reply pill does not fit (right ${pill.right.toFixed(0)} of ${pill.width}, ${pill.height.toFixed(0)}px tall)`);
  console.log('phone: no sideways scroll on "Start a nook" or sign-up, and the reply pill fits on one line');
  await anon.close();
}

await browser.close();
if (errors.length) fail(`page errors:\n${errors.slice(0, 5).join('\n')}`);
console.log('DETAILS_OK');
