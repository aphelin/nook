// Regenerates every image the README shows, into docs/media/ (or --out <dir>).
//
//   node scripts/readme-media.mjs [--out dir] [--only name,name] [--base url]
//
// App captures need a freshly seeded stack (the seed's timestamps are relative to when it ran, and the
// live scenes send messages); `node scripts/fresh-stack.mjs up` starts one from a clean clone, and
// `... down` removes it. The architecture diagram is rendered from docs/diagram/architecture.html.
//
// GIFs are built from Chrome's own screencast (lossless PNG frames with wall-clock timestamps), not
// Playwright's video, which is heavily compressed: each track is laid out on a common clock with
// ffmpeg's concat demuxer, tracks are stacked side by side where a scene has two people, and the GIF
// gets a palette built from the scene itself.
import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fail, root, run } from './lib.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:8080');
const OUT = resolve(arg('out', join(root, 'docs/media')));
const ONLY = arg('only', '')?.split(',').filter(Boolean);
const PASSWORD = 'nook-demo-2026';
const CHALK = { light: '#f1f3f4', dark: '#121416' };

mkdirSync(OUT, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'nook-media-'));
const step = (m) => console.log(`• ${m}`);

function sh(cmd, args) {
  const r = run(cmd, args);
  if (r.status !== 0) fail(`${cmd} ${args.slice(0, 6).join(' ')} … failed:\n${r.out.slice(-2000)}`);
  return r.out;
}

// ---------------------------------------------------------------------------------------------
// Signing in and finding things

/** A signed-in browser context for a seeded member: the refresh cookie lands in the context. */
async function member(browser, handle, options) {
  const context = await browser.newContext({ baseURL: BASE, reducedMotion: 'no-preference', ...options });
  const res = await context.request.post('/api/auth/login', { data: { email: `${handle}@nook.demo`, password: PASSWORD } });
  if (!res.ok()) fail(`could not sign in as ${handle}: ${res.status()} ${await res.text()}`);
  const token = (await res.json()).accessToken;
  const page = await context.newPage();
  const api = async (path) => {
    const r = await context.request.get(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok()) fail(`GET ${path}: ${r.status()}`);
    return r.json();
  };
  return { context, page, api };
}

async function channelId(api, slug, name) {
  const nook = await api(`/nooks/${slug}`);
  const channel = nook.channels.find((c) => c.name === name);
  if (!channel) fail(`no #${name} in ${slug}`);
  return channel.id;
}

async function messageId(api, channel, startsWith) {
  const page = await api(`/channels/${channel}/messages`);
  const list = Array.isArray(page) ? page : page.messages ?? page.items;
  const hit = list.find((m) => m.body?.startsWith(startsWith));
  if (!hit) fail(`no message starting "${startsWith}"`);
  return hit.id;
}

/** Waits until the shell has painted its channel with real rows, fonts loaded and nothing moving. */
async function settled(page) {
  await page.getByRole('button', { name: /^Account: / }).or(page.getByRole('button', { name: 'Open channels' })).first().waitFor();
  await page.getByRole('article').first().waitFor();
  // The transcript stays hidden while it settles on a new channel, then fades in: wait for that too.
  await page.waitForFunction(() => {
    const list = document.querySelector('[data-virtuoso-scroller]');
    return !!list && getComputedStyle(list).visibility === 'visible' && getComputedStyle(list).opacity === '1';
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
}

/** Leaves no hover state behind: the pointer parks on the transcript's empty edge. */
const park = (page) => page.mouse.move(page.viewportSize().width - 4, page.viewportSize().height / 2);

// ---------------------------------------------------------------------------------------------
// Screencast → GIF

async function screencast(page) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    frames.push({ t: metadata.timestamp, data });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  const { width, height } = page.viewportSize();
  await cdp.send('Page.startScreencast', { format: 'png', maxWidth: width, maxHeight: height, everyNthFrame: 1 });
  return {
    frames,
    stop: () => cdp.send('Page.stopScreencast').catch(() => {}),
  };
}

/** Runs `scene` while screencasting every page, then writes one GIF with the pages side by side. */
async function recordGif(name, pages, scene, { fps = 15, gap = 16, background = CHALK.light, width } = {}) {
  step(`recording ${name}`);
  const casts = [];
  for (const page of pages) casts.push(await screencast(page));
  await pages[0].waitForTimeout(600);
  const t0 = Date.now() / 1000;
  await scene();
  await pages[0].waitForTimeout(400);
  const t1 = Date.now() / 1000;
  for (const c of casts) await c.stop();

  const dir = join(work, name);
  mkdirSync(dir, { recursive: true });
  const inputs = [];
  casts.forEach((cast, k) => {
    const frames = cast.frames.filter((f) => f.t <= t1).sort((a, b) => a.t - b.t);
    // The frame on screen at t0 is the last one before it; start the track there.
    const firstIdx = Math.max(0, frames.findLastIndex((f) => f.t <= t0));
    const track = frames.slice(firstIdx);
    if (!track.length) fail(`${name}: no frames from page ${k}`);
    const lines = [];
    track.forEach((f, i) => {
      const file = join(dir, `${k}-${String(i).padStart(5, '0')}.png`);
      writeFileSync(file, Buffer.from(f.data, 'base64'));
      const from = Math.max(f.t, t0);
      const to = i + 1 < track.length ? track[i + 1].t : t1;
      lines.push(`file '${file}'`, `duration ${Math.max(to - from, 0.001).toFixed(4)}`);
    });
    // The concat demuxer ignores the last entry's duration unless the file is repeated.
    lines.push(`file '${join(dir, `${k}-${String(track.length - 1).padStart(5, '0')}.png`)}'`);
    const list = join(dir, `${k}.txt`);
    writeFileSync(list, `${lines.join('\n')}\n`);
    inputs.push('-f', 'concat', '-safe', '0', '-i', list);
  });

  const padded = pages.map((_, k) => (k < pages.length - 1 ? `[${k}:v]fps=${fps},pad=iw+${gap}:ih:0:0:color=${background}[v${k}]` : `[${k}:v]fps=${fps}[v${k}]`));
  const stack = pages.length > 1 ? `${pages.map((_, k) => `[v${k}]`).join('')}hstack=inputs=${pages.length}[s]` : `[v0]null[s]`;
  const scale = width ? `[s]scale=${width}:-1:flags=lanczos[z]` : `[s]null[z]`;
  const palette = `[z]split[a][b];[a]palettegen=max_colors=160:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`;
  const out = join(OUT, `${name}.gif`);
  sh('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', [...padded, stack, scale, palette].join(';'), '-loop', '0', out]);
  console.log(`  ${out}`);
}

// ---------------------------------------------------------------------------------------------
// Scenes

const scenes = {
  async diagram(browser) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 1200, height: 940 }, deviceScaleFactor: 2 });
      await page.goto(`${pathToFileURL(join(root, 'docs/diagram/architecture.html')).href}?theme=${theme}`, { waitUntil: 'networkidle' });
      // fonts.ready can settle before the Google Fonts stylesheet has asked for anything: ask for both faces.
      await page.evaluate(() => Promise.all(['800 27px "Big Shoulders"', '900 44px "Big Shoulders"', '400 16px "Schibsted Grotesk"', '700 16px "Schibsted Grotesk"'].map((f) => document.fonts.load(f))));
      const faces = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
      if (!faces.some((f) => f.includes('Big Shoulders')) || !faces.some((f) => f.includes('Schibsted'))) fail(`diagram fonts did not load: ${faces}`);
      await page.locator('#canvas').screenshot({ path: join(OUT, `architecture-${theme}.png`) });
      await page.close();
    }
  },

  /** The hero: Tuesday Climbers #general at 1440 with a thread open, in light and dark. */
  async shell(browser) {
    const mara = await member(browser, 'mara', { viewport: { width: 1440, height: 900 } });
    const general = await channelId(mara.api, 'tuesday-climbers', 'general');
    const root = await messageId(mara.api, general, 'Photos from Tuesday');
    await mara.page.goto(`/app/tuesday-climbers/${general}?thread=${root}`);
    await settled(mara.page);
    await mara.page.locator('#thread-heading').waitFor();
    await park(mara.page);
    for (const scheme of ['light', 'dark']) {
      await mara.page.emulateMedia({ colorScheme: scheme });
      await mara.page.waitForTimeout(400);
      await mara.page.screenshot({ path: join(OUT, `shell-${scheme}.png`) });
    }
    await mara.context.close();
  },

  /** Three phones, three kits: a channel, a thread drawer, a person card. */
  async phones(browser) {
    const shots = [];
    const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

    const a = await member(browser, 'mara', { ...phone, colorScheme: 'light' });
    const general = await channelId(a.api, 'tuesday-climbers', 'general');
    await a.page.goto(`/app/tuesday-climbers/${general}`);
    await settled(a.page);
    shots.push(join(work, 'phone-1.png'));
    await a.page.screenshot({ path: shots.at(-1) });
    await a.context.close();

    const b = await member(browser, 'mara', { ...phone, colorScheme: 'dark' });
    const reading = await channelId(b.api, 'dog-eared', 'now-reading');
    const list = await b.api(`/channels/${reading}/messages`);
    const rows = Array.isArray(list) ? list : list.messages ?? list.items;
    const threaded = rows.filter((m) => m.replyCount > 0).at(-1);
    if (!threaded) fail('no thread in Dog-Eared #now-reading');
    await b.page.goto(`/app/dog-eared/${reading}?thread=${threaded.id}`);
    await b.page.locator('#thread-heading').waitFor();
    await b.page.evaluate(() => document.fonts.ready);
    await b.page.waitForTimeout(900);
    shots.push(join(work, 'phone-2.png'));
    await b.page.screenshot({ path: shots.at(-1) });
    await b.context.close();

    const c = await member(browser, 'mara', { ...phone, colorScheme: 'light' });
    const lobby = await channelId(c.api, 'patch-bay', 'general');
    await c.page.goto(`/app/patch-bay/${lobby}`);
    await settled(c.page);
    await c.page.getByRole('button', { name: 'Theo Brandt, view profile' }).last().click();
    await c.page.getByRole('dialog').or(c.page.getByRole('tooltip')).first().waitFor();
    await c.page.waitForTimeout(500);
    shots.push(join(work, 'phone-3.png'));
    await c.page.screenshot({ path: shots.at(-1) });
    await c.context.close();

    // Rounded like a phone, on a transparent ground so the strip sits on GitHub's light or dark page.
    const rounded = shots.map((s, i) => {
      const r = join(work, `phone-r${i}.png`);
      sh('magick', [s, '(', '+clone', '-alpha', 'extract', '-draw', "fill black polygon 0,0 0,60 60,0 fill white circle 60,60 60,0", '(', '+clone', '-flip', ')', '-compose', 'Multiply', '-composite', '(', '+clone', '-flop', ')', '-compose', 'Multiply', '-composite', ')', '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', r]);
      return r;
    });
    sh('magick', [rounded[0], '(', '-size', '48x1', 'xc:none', ')', rounded[1], '(', '-size', '48x1', 'xc:none', ')', rounded[2], '-background', 'none', '-gravity', 'center', '+append', '-resize', '50%', join(OUT, 'phones.png')]);
  },

  /** Two people, two phones: typing shows on the other screen, then the message lands on both. */
  async realtime(browser) {
    const opts = { viewport: { width: 400, height: 720 }, colorScheme: 'light' };
    const mara = await member(browser, 'mara', opts);
    const jonas = await member(browser, 'jonas', opts);
    const general = await channelId(mara.api, 'tuesday-climbers', 'general');
    await Promise.all([mara.page.goto(`/app/tuesday-climbers/${general}`), jonas.page.goto(`/app/tuesday-climbers/${general}`)]);
    await Promise.all([settled(mara.page), settled(jonas.page)]);
    const box = (p) => p.getByRole('textbox', { name: /^Message #general/ });
    await recordGif('realtime', [mara.page, jonas.page], async () => {
      await mara.page.waitForTimeout(500);
      await box(mara.page).click();
      await box(mara.page).pressSequentially('Crag it is. Carpool from the station at 17:30?', { delay: 55 });
      await mara.page.waitForTimeout(500);
      await mara.page.keyboard.press('Enter');
      await jonas.page.getByTestId('virtuoso-item-list').getByText('Crag it is.').last().waitFor();
      await jonas.page.waitForTimeout(900);
      await box(jonas.page).click();
      await box(jonas.page).pressSequentially('In. Bringing the new pad', { delay: 60 });
      await jonas.page.waitForTimeout(400);
      await jonas.page.keyboard.press('Enter');
      await mara.page.getByTestId('virtuoso-item-list').getByText('Bringing the new pad').last().waitFor();
      await mara.page.waitForTimeout(1800);
    });
    await mara.context.close();
    await jonas.context.close();
  },

  /** Switching nooks: the kit wipe, three times. */
  async kits(browser) {
    const mara = await member(browser, 'mara', { viewport: { width: 1100, height: 660 }, colorScheme: 'light' });
    const general = await channelId(mara.api, 'tuesday-climbers', 'general');
    await mara.page.goto(`/app/tuesday-climbers/${general}`);
    await settled(mara.page);
    // Visit each nook once first, so the recording shows the wipe, not a first page load.
    const rail = mara.page.getByRole('navigation', { name: 'Nooks' });
    for (const n of ['Dog-Eared', 'Patch Bay', 'Tuesday Climbers']) {
      await rail.getByRole('link', { name: new RegExp(`^${n}`) }).click();
      await mara.page.waitForURL(/\/app\/[a-z-]+\/[0-9a-f-]{36}/);
      await settled(mara.page);
    }
    // The last switch back can still be swapping lists when the old one reads as settled.
    await mara.page.waitForTimeout(1500);
    await park(mara.page);
    await recordGif('kits', [mara.page], async () => {
      for (const n of ['Dog-Eared', 'Patch Bay', 'Tuesday Climbers']) {
        await mara.page.waitForTimeout(1100);
        await rail.getByRole('link', { name: new RegExp(`^${n}`) }).click();
        await park(mara.page);
      }
      await mara.page.waitForTimeout(1300);
    });
    await mara.context.close();
  },

  /** Cmd+K: a few letters, an old message, and the jump that flashes it. */
  async search(browser) {
    const mara = await member(browser, 'mara', { viewport: { width: 1100, height: 660 }, colorScheme: 'light' });
    const general = await channelId(mara.api, 'tuesday-climbers', 'general');
    await mara.page.goto(`/app/tuesday-climbers/${general}`);
    await settled(mara.page);
    await park(mara.page);
    const palette = mara.page.getByRole('dialog', { name: 'Command palette' });
    await recordGif('search', [mara.page], async () => {
      await mara.page.waitForTimeout(700);
      await mara.page.keyboard.press('Control+k');
      await palette.waitFor();
      await mara.page.waitForTimeout(400);
      await mara.page.keyboard.type('heel ho', { delay: 80 });
      const hit = palette.getByRole('option', { name: /heel hook on the big jug/i });
      await hit.waitFor();
      await mara.page.waitForTimeout(900);
      while ((await hit.getAttribute('aria-selected')) !== 'true') {
        await mara.page.keyboard.press('ArrowDown');
        await mara.page.waitForTimeout(260);
      }
      await mara.page.waitForTimeout(500);
      await mara.page.keyboard.press('Enter');
      await mara.page.waitForURL(/\?m=/);
      await mara.page.waitForTimeout(2200);
    });
    await mara.context.close();
  },

  /** The landing page: the live nook talking, then the kit rack re-dressing the first screen. */
  async landing(browser) {
    // 1280 × 800 is the first two-column width: headline beside the live nook, the rack under it.
    const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
    const page = await context.newPage();
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    await park(page);
    const rack = page.getByRole('group', { name: 'Try another club' });
    await recordGif('landing', [page], async () => {
      await page.waitForTimeout(2200);
      for (const n of ['Dog-Eared', 'Patch Bay', 'Harbour Rowing', 'Tuesday Climbers']) {
        await rack.getByRole('button', { name: n }).click();
        await park(page);
        await page.waitForTimeout(1900);
      }
    });
    await context.close();
  },
};

const names = ONLY.length ? ONLY : Object.keys(scenes);
for (const n of names) if (!scenes[n]) fail(`unknown scene ${n}; have ${Object.keys(scenes).join(', ')}`);
const browser = await chromium.launch();
try {
  for (const n of names) {
    step(n);
    await scenes[n](browser);
  }
} finally {
  await browser.close();
  rmSync(work, { recursive: true, force: true });
}
console.log(`MEDIA_OK ${OUT}`);
