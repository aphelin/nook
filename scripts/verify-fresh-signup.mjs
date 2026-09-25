// Round 3 R12: signing up after someone else in the same tab starts clean. In one browser tab the
// demo member signs in and opens their nooks, signs out, and a brand-new person signs up; from the
// moment they submit until their home has settled, none of the demo member's nooks is ever on the
// page (watched with a MutationObserver, so a single frame of it would count), they land on the
// "not in a nook yet" home, and the address never turns to one of the demo's nooks. As a control,
// the same watcher does see those names while the demo member is signed in.
//
//   node scripts/verify-fresh-signup.mjs [base url]
import { chromium } from '@playwright/test';
import { clearDemoLimit, fail, run } from './lib.mjs';

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const DEMO_NOOKS = ['Tuesday Climbers', 'Dog-Eared', 'Patch Bay'];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

/** Starts watching the page for any of `names`, from now; `seen()` returns what it saw. */
const watch = (names) =>
  page.evaluate((names) => {
    window.__seen = new Set();
    const look = () => {
      const text = document.body.innerText;
      for (const n of names) if (text.includes(n)) window.__seen.add(n);
      for (const n of names) if (location.pathname.includes(n.toLowerCase().replace(/ /g, '-'))) window.__seen.add(`${n} (address)`);
    };
    look();
    new MutationObserver(look).observe(document.body, { childList: true, subtree: true, characterData: true });
  }, names);
const seen = () => page.evaluate(() => [...window.__seen]);

clearDemoLimit();
run('docker', ['exec', 'nook-redis-1', 'sh', '-c', "redis-cli --scan --pattern 'rl:register:*' | xargs -r redis-cli del"]);
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: /try the demo|open nook/i }).first().click();
await page.waitForURL(/\/app\/[^/]+\/[^/]+/, { timeout: 30000 });
await watch(DEMO_NOOKS);
await page.waitForTimeout(1500);
if (!(await seen()).length) fail("control: the watcher did not see the demo member's own nooks while they were signed in");

await page.getByRole('button', { name: /^Account:/ }).click();
await page.getByRole('menuitem', { name: 'Sign out' }).click();
await page.waitForURL((u) => !u.pathname.startsWith('/app'), { timeout: 15000 });
// On to sign-up inside the app, by its own link (a full page load would start a new cache anyway,
// and hide the bug this guards against).
await page.locator('a[href^="/signup"]').first().click();
await page.waitForURL(/\/signup/, { timeout: 15000 });
const id = Math.random().toString(36).slice(2, 8);
await page.getByLabel('Display name').fill(`Fresh Start ${id}`);
await page.getByLabel('Handle').fill(`fresh_${id}`);
await page.getByLabel('Email').fill(`fresh.${id}@example.com`);
await page.getByLabel('Password', { exact: true }).fill('fresh-start-2026');
await watch(DEMO_NOOKS);
await page.getByRole('button', { name: /join|sign up|create/i }).last().click();
// Until their home is up (or the last person's nooks show), then a moment more for anything late.
const home = page.getByRole('heading', { name: /not in a nook yet/i });
for (const t0 = Date.now(); Date.now() - t0 < 20000; ) {
  if ((await seen()).length || (await home.isVisible())) break;
  await page.waitForTimeout(100);
}
await page.waitForTimeout(2500);
const leaked = await seen();
if (leaked.length) fail(`after signing up, the new person was shown the last person's nooks: ${leaked.join(', ')}`);
if (!(await home.isVisible()) || !/\/app\/?$/.test(new URL(page.url()).pathname)) fail(`the new person ended up at ${page.url()}, not their empty home`);
console.log('a new person signing up after the demo member, in the same tab, never sees the demo nooks and lands on an empty home');

await browser.close();
if (errors.length) fail(`page errors:\n${errors.slice(0, 5).join('\n')}`);
console.log('FRESH_SIGNUP_OK');
