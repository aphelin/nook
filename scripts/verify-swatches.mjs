// Round 3 R13: each colour swatch on "Start a nook" shows the page it turns into. In both schemes,
// for every preset: pick it, and the swatch's upper part (sampled from the screen) is the colour the
// page's room then is, and its foot band the page's highlight (the "Start the nook" button),
// within 6 in RGB. As a control, a swatch drawn the old way (the club's bright colour over its deep
// one) must be caught mismatching the night page.
//
//   node scripts/verify-swatches.mjs [base url]
import { chromium } from '@playwright/test';
import { clearDemoLimit, fail } from './lib.mjs';

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
const errors = [];
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const rgb = (css) => css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

async function sample(page, radio) {
  const shot = await radio.screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const at = (fy) => [...g.getImageData(Math.round(c.width / 2), Math.round(c.height * fy), 1, 1).data].slice(0, 3);
    return { room: at(0.3), hi: at(0.88) };
  }, shot.toString('base64'));
}

let checked = 0;
for (const scheme of ['dark', 'light']) {
  clearDemoLimit();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: scheme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /try the demo|open nook/i }).first().click();
  await page.waitForURL(/\/app\/[^/]+\/[^/]+/, { timeout: 30000 });
  await page.goto(`${BASE}/app/new`, { waitUntil: 'domcontentloaded' });
  const radios = page.getByRole('radio');
  await radios.first().waitFor({ timeout: 20000 });
  const n = await radios.count();
  if (n < 8) fail(`${scheme}: only ${n} colour swatches`);
  for (let i = 0; i < n; i += 1) {
    const radio = radios.nth(i);
    const name = await radio.getAttribute('aria-label');
    await radio.click();
    await page.waitForTimeout(500);
    // The page after it has tried the kit on: its room and its highlight.
    const page_ = await page.evaluate(() => ({
      room: getComputedStyle(document.querySelector('main')).backgroundColor,
      hi: getComputedStyle(document.querySelector('button[type="submit"]')).backgroundColor,
    }));
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    const s = await sample(page, radio);
    const room = near(s.room, rgb(page_.room));
    const hi = near(s.hi, rgb(page_.hi));
    if (room > 6) fail(`${scheme} ${name}: the swatch shows ${s.room} but the page turns ${page_.room}`);
    if (hi > 6) fail(`${scheme} ${name}: the swatch's band shows ${s.hi} but the page's highlight is ${page_.hi}`);
    checked += 1;
  }
  if (scheme === 'dark') {
    // Control: the old swatch (bright over deep) against the night page it would have promised.
    const radio = radios.nth(0);
    await radio.click();
    await page.waitForTimeout(400);
    await radio.evaluate((el) => {
      el.style.backgroundImage = 'linear-gradient(to bottom, var(--club-bright) 70%, var(--wing-bg) 70%)';
    });
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    const s = await sample(page, radio);
    const roomNow = await page.evaluate(() => getComputedStyle(document.querySelector('main')).backgroundColor);
    if (!(near(s.room, rgb(roomNow)) > 6)) fail('control: a bright-over-deep swatch went unnoticed against the night page');
    await radio.evaluate((el) => (el.style.backgroundImage = ''));
  }
  console.log(`${scheme}: all ${n} swatches show the room and highlight the page turns into`);
  await ctx.close();
}

await browser.close();
if (errors.length) fail(`page errors:\n${errors.slice(0, 5).join('\n')}`);
console.log(`${checked} swatches checked`);
console.log('SWATCHES_OK');
