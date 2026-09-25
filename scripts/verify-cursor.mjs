// Round 3 R4: anything you can press shows the hand, measured in a real browser. On the landing,
// the sign-in and sign-up pages, and in the app with its popovers, menus and dialogs open, every
// visible, enabled button, link, radio, switch, checkbox, tab, menu item, option and label that
// wraps a control has `cursor: pointer`, and so does each person in the landing's crowd (they can
// be tapped). A planted button with the arrow cursor is caught first, so the sweep can fail.
//
//   node scripts/verify-cursor.mjs [base url]
import { chromium } from '@playwright/test';
import { fail } from './lib.mjs';

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
const errors = [];
let checked = 0;

/** Every visible, enabled pressable thing on the page (including portalled popups) without the hand. */
const arrows = (page) =>
  page.evaluate(() => {
    const pressable = [
      'button',
      'a[href]',
      '[role="button"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="checkbox"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="menuitemradio"]',
      '[role="option"]',
      'summary',
      'label:has(input:not([type="text"], [type="email"], [type="password"], [type="search"]))',
    ].join(',');
    const shown = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility === 'visible' && cs.pointerEvents !== 'none';
    };
    const off = (el) => el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true' || el.closest('[inert]');
    const all = [...document.querySelectorAll(pressable)].filter((el) => shown(el) && !off(el));
    return {
      count: all.length,
      bad: all
        .filter((el) => getComputedStyle(el).cursor !== 'pointer')
        .map((el) => `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}" (${getComputedStyle(el).cursor})`),
    };
  });

async function sweep(page, where) {
  const { count, bad } = await arrows(page);
  checked += count;
  if (bad.length) fail(`${where}: ${bad.length} pressable things show the arrow: ${bad.slice(0, 6).join('; ')}`);
  console.log(`${where}: ${count} pressable things, all with the hand`);
}

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelector('.crowd')?.hasAttribute('data-landed'));

// Control: a planted button with the arrow cursor must be caught.
await page.evaluate(() => {
  const b = document.createElement('button');
  b.textContent = 'planted';
  b.style.cssText = 'position:fixed;top:0;left:0;cursor:default;z-index:9999';
  b.id = 'planted';
  document.body.append(b);
});
const control = await arrows(page);
if (!control.bad.some((b) => b.includes('planted'))) fail('control: a planted button with the arrow cursor went unnoticed');
await page.evaluate(() => document.getElementById('planted').remove());

await sweep(page, 'landing');
// The crowd's people can be tapped: their drawn shapes show the hand.
const crowd = await page.evaluate(() => {
  const band = [...document.querySelectorAll('.crowd [data-crowd-band]')].find((b) => b.getClientRects().length > 0);
  const shapes = [...band.querySelectorAll('[data-person] svg path:not([data-initial])')];
  return { n: shapes.length, bad: shapes.filter((p) => getComputedStyle(p).cursor !== 'pointer').length };
});
if (!crowd.n || crowd.bad) fail(`${crowd.bad} of ${crowd.n} people in the crowd show the arrow`);
console.log(`landing crowd: all ${crowd.n} people show the hand`);

for (const path of ['/login', '/signup']) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await sweep(page, path);
}

// The app, with each popup open in turn.
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: /try the demo|open nook/i }).first().click();
await page.waitForURL(/\/app\/[^/]+\/[^/]+/, { timeout: 30000 });
await page.waitForTimeout(1500);
await sweep(page, 'app shell');
const popups = [
  ['account menu', () => page.getByRole('button', { name: /^Account:/ }).click()],
  ['new channel', () => page.getByRole('button', { name: 'New channel' }).click()],
  ['new direct message', () => page.getByRole('button', { name: 'Message someone' }).click()],
  ['invite', () => page.getByRole('button', { name: 'Invite people' }).click()],
  ['inbox', () => page.getByRole('button', { name: /inbox/i }).first().click()],
  ['command palette', () => page.getByRole('button', { name: 'Search and jump' }).click()],
];
for (const [name, open] of popups) {
  await open();
  await page.waitForTimeout(450);
  await sweep(page, name);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
}
// The profile dialog, through the account menu.
await page.getByRole('button', { name: /^Account:/ }).click();
await page.getByRole('menuitem', { name: /edit profile/i }).click();
await page.waitForTimeout(600);
await sweep(page, 'profile dialog');
await page.keyboard.press('Escape');

await browser.close();
if (errors.length) fail(`page errors:\n${errors.slice(0, 5).join('\n')}`);
console.log(`${checked} pressable things checked across the pages`);
console.log('CURSOR_OK');
