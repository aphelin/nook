// Polish G16: switching nooks is a story cube. In a real browser: picking a nook further down the
// rail runs a view transition whose old and new root snapshots rotate about the vertical axis in
// opposite senses (frozen part way to read their 3D transforms); going back up turns the other way;
// each lands on the nook picked, with the turn attribute cleared and no overlay element left; the
// landing's club picks turn the same way; under reduced motion no transition runs; and the old
// flood-wipe is gone from the source.
//
//   node scripts/verify-switch.mjs [base url]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { fail, root } from './lib.mjs';

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';

// The old wipe, anywhere in the web app's source.
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const leftovers = walk(join(root, 'apps/web/src')).filter((f) => /wipe-open|wipe-lift|wipeTo\(|<Wipe\b|shell\/wipe/.test(readFileSync(f, 'utf8')));
if (leftovers.length) fail(`the old wipe is still in: ${leftovers.join(', ')}`);

const browser = await chromium.launch();
const errors = [];

/** Watches the next view transition: its pseudo animations, and each face's Y-rotation 250ms in. */
const armTurn = (page) =>
  page.evaluate(() => {
    window.__turn = null;
    const start = document.startViewTransition?.bind(document);
    if (!start) return;
    document.startViewTransition = (update) => {
      const vt = start(update);
      vt.ready.then(() => {
        const faces = document.getAnimations().filter((a) => /view-transition-(old|new)\(root\)/.test(a.effect?.pseudoElement ?? ''));
        faces.forEach((a) => {
          a.pause();
          a.currentTime = 250;
        });
        const angle = (pseudo) => {
          const m = new DOMMatrix(getComputedStyle(document.documentElement, pseudo).transform);
          return (Math.atan2(-m.m13, m.m11) * 180) / Math.PI;
        };
        window.__turn = {
          names: faces.map((a) => `${a.effect.pseudoElement} ${a.animationName}`),
          old: angle('::view-transition-old(root)'),
          fresh: angle('::view-transition-new(root)'),
          attr: document.documentElement.dataset.turn ?? null,
        };
        faces.forEach((a) => a.play());
      });
      return vt;
    };
  });

const settle = (page) => page.waitForFunction(() => !document.documentElement.dataset.turn && !document.querySelector('.wipe'), null, { timeout: 5000 });

async function signIn(reducedMotion) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /try the demo|open nook/i }).first().click();
  await page.waitForURL(/\/app\/[^/]+\/[^/]+/, { timeout: 20000 });
  await page.getByRole('navigation', { name: 'Nooks' }).waitFor();
  await page.waitForTimeout(800);
  return { ctx, page };
}

const nookLinks = (page) => page.getByRole('navigation', { name: 'Nooks' }).getByRole('listitem').getByRole('link').filter({ hasNot: page.getByText('Start a nook') });

// Full motion: down the rail, then back up.
{
  const { ctx, page } = await signIn('no-preference');
  const links = nookLinks(page);
  const count = await links.count();
  if (count < 2) fail('need at least two nooks on the rail');
  const current = await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Nooks"] a[aria-current="page"]')].map((a) => a.getAttribute('href'))[0]);
  const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')).filter((h) => h?.startsWith('/app/') && h !== '/app/new'));
  const here = hrefs.indexOf(current);
  const down = hrefs[here + 1] ? here + 1 : here - 1;
  const trip = [
    { to: down, expect: down > here ? 'next' : 'prev' },
    { to: here, expect: down > here ? 'prev' : 'next' },
  ];
  for (const leg of trip) {
    await armTurn(page);
    await page.locator(`nav[aria-label="Nooks"] a[href="${hrefs[leg.to]}"]`).click();
    await page.waitForFunction(() => window.__turn, null, { timeout: 5000 });
    const t = await page.evaluate(() => window.__turn);
    await settle(page);
    const needs = [`::view-transition-old(root) turn-out-${leg.expect}`, `::view-transition-new(root) turn-in-${leg.expect}`];
    if (!needs.every((n) => t.names.includes(n))) fail(`the turn ran ${JSON.stringify(t.names)}, expected ${needs.join(' and ')}`);
    if (t.attr !== leg.expect) fail(`data-turn was ${t.attr} during a ${leg.expect} turn`);
    const [oldSign, newSign] = leg.expect === 'next' ? [-1, 1] : [1, -1];
    if (!(Math.sign(t.old) === oldSign && Math.sign(t.fresh) === newSign && Math.abs(t.old) > 5 && Math.abs(t.fresh) > 5))
      fail(`faces not turning about the vertical axis the ${leg.expect} way (old ${t.old.toFixed(1)}°, new ${t.fresh.toFixed(1)}°)`);
    await page.waitForURL(new RegExp(hrefs[leg.to].replace(/\//g, '\\/')), { timeout: 5000 });
    const shown = await page.evaluate(() => document.querySelector('nav[aria-label="Nooks"] a[aria-current="page"]')?.getAttribute('href'));
    if (shown !== hrefs[leg.to]) fail(`landed on ${shown}, not ${hrefs[leg.to]}`);
    console.log(`${leg.expect}: old face ${t.old.toFixed(0)}°, new face ${t.fresh.toFixed(0)}° at 250ms; landed on ${shown}`);
  }
  await ctx.close();
}

// The landing's club picks turn too.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await armTurn(page);
  await page.getByRole('group', { name: 'Try another club' }).getByRole('button', { name: 'Patch Bay' }).click();
  await page.waitForFunction(() => window.__turn, null, { timeout: 5000 });
  const t = await page.evaluate(() => window.__turn);
  await settle(page);
  if (!t.names.some((n) => n.includes('turn-in-next'))) fail(`a landing club pick did not turn: ${JSON.stringify(t.names)}`);
  if ((await page.getByRole('group', { name: 'Try another club' }).getByRole('button', { name: 'Patch Bay' }).getAttribute('aria-pressed')) !== 'true') fail('the landing did not land on Patch Bay');
  console.log('landing: a club pick turns forward and lands on it');
  await ctx.close();
}

// Reduced motion: a plain cut.
{
  const { ctx, page } = await signIn('reduce');
  await page.evaluate(() => {
    window.__turns = 0;
    const start = document.startViewTransition?.bind(document);
    if (start)
      document.startViewTransition = (u) => {
        window.__turns += 1;
        return start(u);
      };
  });
  const hrefs = await nookLinks(page).evaluateAll((as) => as.map((a) => a.getAttribute('href')).filter((h) => h?.startsWith('/app/') && h !== '/app/new'));
  const current = await page.evaluate(() => document.querySelector('nav[aria-label="Nooks"] a[aria-current="page"]')?.getAttribute('href'));
  const other = hrefs.find((h) => h !== current);
  await page.locator(`nav[aria-label="Nooks"] a[href="${other}"]`).click();
  await page.waitForURL(new RegExp(other.replace(/\//g, '\\/')), { timeout: 5000 });
  if (await page.evaluate(() => window.__turns)) fail('reduced motion: a view transition ran');
  console.log('reduced motion: the switch is a plain cut');
  await ctx.close();
}

await browser.close();
if (errors.length) fail(`page errors:\n${errors.slice(0, 5).join('\n')}`);
console.log('SWITCH_OK');
