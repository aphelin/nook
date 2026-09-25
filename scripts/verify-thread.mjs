// Round 3 R7: a thread opens on the click and slides in and out, on the compositor. Clicking
// "Reply in thread" shows the thread panel within 150ms of the click event, with no request to the
// server for it (no RSC fetch), and puts ?thread= in the URL. At xl its card slides in over the room
// from the right: recorded through a CDP screencast with the main thread held for 350ms straight
// after the click (as drawing a long thread would), the card is still seen at three or more
// positions on its way in, and once it is in place the room gives it its 420px column. Closing, the
// room takes the width back and the card is seen sliding out, then it is gone and so is ?thread=.
// Round 4 R22: the room gives way with the card rather than after it. Sampled every frame with the
// main thread free, the composer narrows through eight or more widths while the card comes in (and
// widens through eight or more going out), and the card's left edge stays within 24px of the room's
// right edge the whole way, so neither a gap nor a jump opens between them. (A run in which the
// machine stalls the page for more than 150ms, or starves it to under 18 frames in the first
// 500ms, is taken again, up to three times, and reported.)
// A reload with ?thread= opens the same thread; under reduced motion it is in place at once.
//
//   node scripts/verify-thread.mjs [base url]
import { chromium } from '@playwright/test';
import { clearDemoLimit, fail } from './lib.mjs';

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
const errors = [];

async function open(reducedMotion) {
  clearDemoLimit();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /try the demo|open nook/i }).first().click();
  await page.waitForURL(/\/app\/[^/]+\/[^/]+/, { timeout: 30000 });
  await page.waitForTimeout(2000);
  return { ctx, page };
}

/** The side column's width now. */
const column = (page) =>
  page.evaluate(() => Number.parseFloat(getComputedStyle(document.querySelector('[data-testid="shell"]')).gridTemplateColumns.split(' ').at(-1)));

/** Holds the main thread for 350ms straight after the next click's own work. */
const holdAfterClick = (page) =>
  page.evaluate(() =>
    document.addEventListener(
      'click',
      () =>
        setTimeout(() => {
          const t = performance.now();
          while (performance.now() - t < 350);
        }, 0),
      { capture: true, once: true },
    ),
  );

/** Records the screen while `act` runs; returns how much of a row across the right third is card-coloured, frame by frame. */
async function cardWidths(page, ctx, act) {
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ t: f.metadata.timestamp * 1000, data: f.data });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId });
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await page.waitForTimeout(250);
  const t0 = Date.now();
  await act();
  await page.waitForTimeout(900);
  await cdp.send('Page.stopScreencast');
  const colour = await page.evaluate(() => {
    const card = document.querySelector('[data-side-panel] .surface-card') ?? document.querySelector('.surface-card');
    return getComputedStyle(card).backgroundColor;
  });
  const widths = await page.evaluate(
    async ({ frames, colour }) => {
      const [r0, g0, b0] = colour.match(/\d+/g).map(Number);
      const out = [];
      for (const f of frames) {
        const img = new Image();
        img.src = `data:image/png;base64,${f.data}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = 560;
        c.height = 1;
        const g = c.getContext('2d');
        // A row near the bottom of the card, above the reply box: through the card's empty middle.
        g.drawImage(img, img.naturalWidth - 560, Math.round(img.naturalHeight * 0.62), 560, 1, 0, 0, 560, 1);
        const d = g.getImageData(0, 0, 560, 1).data;
        let n = 0;
        for (let x = 0; x < 560; x += 1) if (Math.hypot(d[x * 4] - r0, d[x * 4 + 1] - g0, d[x * 4 + 2] - b0) < 12) n += 1;
        out.push({ t: f.t, n });
      }
      return out;
    },
    { frames, colour },
  );
  return { widths, t0 };
}

/** Every frame while `act` runs: the composer's width, the room's right edge and the card's left edge (and any stall of the page's main thread). */
async function track(page, act) {
  await page.evaluate(() => {
    window.__track = [];
    window.__stalls = [];
    window.__stallWatch?.disconnect();
    window.__stallWatch = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.duration > 150) window.__stalls.push(`${Math.round(e.duration)}ms`);
    });
    window.__stallWatch.observe({ type: 'longtask' });
    const shell = document.querySelector('[data-testid="shell"]');
    const t0 = performance.now();
    const tick = () => {
      const composer = document.querySelector('main form') ?? document.querySelector('main textarea');
      const room = document.querySelector('main');
      const card = document.querySelector('[data-side-panel] .surface-card');
      window.__track.push({
        t: performance.now() - t0,
        composer: composer?.getBoundingClientRect().width ?? 0,
        room: room?.getBoundingClientRect().right ?? 0,
        card: card ? card.getBoundingClientRect().left : null,
        column: Number.parseFloat(getComputedStyle(shell).gridTemplateColumns.split(' ').at(-1)),
      });
      if (performance.now() - t0 < 900) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await act();
  await page.waitForTimeout(1000);
  return page.evaluate(() => ({ frames: window.__track, stalls: window.__stalls }));
}

/**
 * Opens or closes the thread with the main thread free, measuring the way. A stall of the page
 * that the machine caused (another program's load, memory paging) is not the page freeing its main
 * thread, so a run with one is put back and taken again, up to three times, and reported.
 */
async function freely(page, label, open, close) {
  const stalls = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const run = await track(page, open);
    // Starved of frames: the page drew fewer than 18 in the first 500ms (a free page draws about 30).
    const drawn = run.frames.filter((f) => f.t <= 500).length;
    if (!run.stalls.length && drawn >= 18) return { ...together(run.frames, label), stalls };
    stalls.push(...(run.stalls.length ? run.stalls : [`${drawn} frames in 500`]));
    if (close) await close();
    await page.waitForTimeout(600);
  }
  fail(`${label}: the machine stalled the page on every try (${stalls.join(', ')}), so the room could not be measured`);
}

/** How the room and the card moved together over one open or close. */
function together(frames, label) {
  const widths = new Set(frames.map((f) => Math.round(f.composer)));
  const moving = frames.filter((f) => f.column > 4 && f.column < 416 && f.card !== null);
  const worst = Math.max(0, ...moving.map((f) => Math.abs(f.card - f.room)));
  if (widths.size < 8) fail(`${label}: the composer jumped (${widths.size} widths seen) instead of resizing with the thread`);
  if (moving.length < 6) fail(`${label}: the thread column was seen part-way on only ${moving.length} frames`);
  if (worst > 24) fail(`${label}: the card and the room came ${worst.toFixed(0)}px apart on the way`);
  return { widths: widths.size, frames: moving.length, worst };
}

async function replyButton(page) {
  const row = page.locator('main article[data-message-id]').nth(-2);
  await row.hover();
  return row.getByRole('button', { name: 'Reply in thread' });
}

{
  const { ctx, page } = await open('no-preference');
  const rsc = [];
  page.on('request', (r) => {
    if (r.url().includes('_rsc=') || r.headers().rsc === '1') rsc.push(r.url());
  });
  // Timed in the page: from the click event to the panel being in the document. A slow try (the
  // machine stalling the page, as another program's load or memory paging can) is closed and taken
  // again, up to three times, and reported; three slow tries fail.
  const slow = [];
  let opening;
  let shownIn;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const button = await replyButton(page);
    await page.evaluate(() => {
      window.__shown = new Promise((done) => {
        document.addEventListener(
          'click',
          () => {
            const t0 = performance.now();
            const seen = new MutationObserver(() => {
              if (!document.querySelector('[data-side-panel]')) return;
              seen.disconnect();
              done(performance.now() - t0);
            });
            seen.observe(document.body, { childList: true, subtree: true });
          },
          { capture: true, once: true },
        );
      });
    });
    await holdAfterClick(page);
    opening = await cardWidths(page, ctx, () => button.click());
    shownIn = await page.evaluate(() => window.__shown);
    if (shownIn <= 150) break;
    slow.push(Math.round(shownIn));
    if (attempt === 2) fail(`the thread took ${slow.join(', ')}ms to appear after the click, on every try`);
    await page.getByRole('button', { name: 'Close thread' }).click();
    await page.waitForTimeout(900);
  }
  if (rsc.length) fail(`opening a thread asked the server for the page: ${rsc[0]}`);
  if (!/[?&]thread=/.test(page.url())) fail('the URL does not carry the open thread');
  const held = opening.widths.filter((f) => f.t >= opening.t0 && f.t <= opening.t0 + 460);
  const sliding = new Set(held.filter((f) => f.n > 20 && f.n < 380).map((f) => Math.round(f.n / 4)));
  if (sliding.size < 3) fail(`the thread card was not seen sliding in while the main thread was busy (${sliding.size} positions)`);
  if (Math.round(await column(page)) !== 420) fail(`once in place, the thread column is ${await column(page)}px, not 420`);
  console.log(
    `open: shown ${shownIn.toFixed(0)}ms after the click with no server round trip${slow.length ? ` (after ${slow.length} slow ${slow.length > 1 ? 'tries' : 'try'}: ${slow.join(', ')}ms)` : ''}; the card slid in through ${sliding.size} positions with the main thread held; the room then gave it 420px`,
  );
  const url = page.url();

  // Closing: the room takes the width back and the card slides out, then it is gone.
  const closing = await cardWidths(page, ctx, () => page.getByRole('button', { name: 'Close thread' }).click());
  const out = new Set(closing.widths.filter((f) => f.n > 20 && f.n < 380).map((f) => Math.round(f.n / 4)));
  if (out.size < 3) fail(`the thread card did not slide out (${out.size} positions)`);
  if (await page.evaluate(() => !!document.querySelector('[data-side-panel]'))) fail('the thread panel stayed after sliding out');
  if (Math.round(await column(page)) !== 0) fail('the room did not take the thread column back');
  if (/[?&]thread=/.test(page.url())) fail('the URL still carries the thread after closing it');
  console.log(`close: the card slid out through ${out.size} positions and was let go; the room has its width back`);

  // The room gives way with the card, and takes the width back with it, with the main thread free.
  const closeThread = () => page.getByRole('button', { name: 'Close thread' }).click();
  const openThread = async () => (await replyButton(page)).click();
  const inWay = await freely(page, 'open', openThread, closeThread);
  const outWay = await freely(page, 'close', closeThread, openThread);
  const retried = [...inWay.stalls, ...outWay.stalls];
  console.log(
    `room: opening, the composer resized through ${inWay.widths} widths with the card never more than ${inWay.worst.toFixed(0)}px off the room's edge; closing, ${outWay.widths} widths and ${outWay.worst.toFixed(0)}px${retried.length ? ` (taken again after the machine stalled the page: ${retried.join(', ')})` : ''}`,
  );

  // A reload with the thread in the URL opens it.
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-side-panel]').waitFor({ timeout: 30000 });
  console.log('reload: the thread in the URL opens again');
  await ctx.close();
}

// Reduced motion: at full width at once.
{
  const { ctx, page } = await open('reduce');
  const button = await replyButton(page);
  await button.click();
  await page.locator('[data-side-panel]').waitFor({ timeout: 2000 });
  await page.waitForTimeout(50);
  const width = await column(page);
  const moving = await page.evaluate(() => document.querySelector('[data-side-panel]').getAnimations().length);
  if (Math.round(width) !== 420 || moving) fail(`under reduced motion the thread was not simply in place (column ${width}px, ${moving} animations)`);
  console.log('reduced motion: the thread is in place at once');
  await ctx.close();
}

await browser.close();
if (errors.length) fail(`page errors:\n${errors.slice(0, 5).join('\n')}`);
console.log('THREAD_OK');
