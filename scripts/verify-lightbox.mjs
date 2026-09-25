// Round 4 R23: the picture viewer puts itself away and steps through a message's pictures. Someone
// sends three pictures in one message. Opening the second shows "2 of 3"; the next arrow, the
// right-arrow key and a leftward touch swipe each move on one (wrapping from the last to the first),
// in the order they were attached, which is also the order the message shows them in,
// the previous arrow and the left-arrow key move back, and a dot jumps straight to its picture, the
// dialog naming the one on show each time. A click on the picture itself leaves it open; a click on
// the dim around it closes the viewer, as Escape does. A message with one picture shows no arrows.
//
//   node scripts/verify-lightbox.mjs [base url]
import { crc32, deflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { clearLimit, fail } from './lib.mjs';

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const run = Date.now().toString(36);

/** A solid-colour RGB PNG, built by hand. */
function png(width, height, [r, g, b]) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

clearLimit('register');
const handle = `lb_${run}`.slice(0, 24);
const reg = await page.request.post('/api/auth/register', {
  data: { email: `${handle}@example.test`, handle, displayName: `Lightbox ${run}`, password: 'correct horse battery' },
});
if (reg.status() !== 201) fail(`could not register (${reg.status()})`);
const auth = { Authorization: `Bearer ${(await reg.json()).accessToken}` };
const slug = `lightbox-${run}`.slice(0, 32);
const created = await page.request.post('/api/nooks', { headers: auth, data: { name: 'Pictures', slug, kit: { field: '#0f5257', mark: '#f4d35e' } } });
const general = (await created.json()).channels.find((c) => c.name === 'general').id;
await page.goto(`/app/${slug}/${general}`);

const box = page.getByRole('textbox', { name: 'Message #general' });
const send = page.getByRole('button', { name: 'Send message' });
async function sendPictures(text, files) {
  await page.locator('main input[type="file"]').first().setInputFiles(files);
  await page.waitForFunction((n) => document.querySelectorAll('[aria-label="Attached files"] li').length === n, files.length, { timeout: 15000 });
  await box.fill(text);
  await page.waitForFunction(() => !document.querySelector('button[aria-label="Send message"]')?.disabled, null, { timeout: 20000 });
  await send.click();
}

await sendPictures('One on its own', [{ name: 'alone.png', mimeType: 'image/png', buffer: png(320, 200, [200, 60, 40]) }]);
await sendPictures('Three from the crag', [
  { name: 'first.png', mimeType: 'image/png', buffer: png(400, 300, [31, 78, 121]) },
  { name: 'second.png', mimeType: 'image/png', buffer: png(300, 400, [244, 211, 94]) },
  { name: 'third.png', mimeType: 'image/png', buffer: png(500, 250, [60, 160, 90]) },
]);

// The worker measures them; then they can be opened.
const open = (name) => page.getByRole('button', { name: `Open ${name}` });
await open('second.png').waitFor({ timeout: 30000 });
await open('third.png').waitFor({ timeout: 30000 });
await open('first.png').waitFor({ timeout: 30000 });
const order = await page.locator('ul[aria-label="3 images"] button').evaluateAll((b) => b.map((x) => x.getAttribute('aria-label')));
if (order.join() !== 'Open first.png,Open second.png,Open third.png') fail(`the message shows its pictures out of order: ${order.join(', ')}`);

const dialog = page.getByRole('dialog');
let step = 'opening';
async function showing(name, at) {
  await page.getByRole('dialog', { name }).waitFor({ timeout: 3000 }).catch(() => fail(`${step}: expected ${name} on show`));
  if (at) {
    const count = (await dialog.locator('[data-num]').textContent())?.trim();
    if (count !== at) fail(`${step}: the count reads "${count}", not "${at}"`);
  }
}

await open('second.png').click();
await showing('second.png', '2 of 3');
step = 'next arrow';
await page.getByRole('button', { name: 'Next image' }).click();
await showing('third.png', '3 of 3');
step = 'right key';
await page.keyboard.press('ArrowRight');
await showing('first.png', '1 of 3');
step = 'previous arrow';
await page.getByRole('button', { name: 'Previous image' }).click();
await showing('third.png', '3 of 3');
step = 'left key';
await page.keyboard.press('ArrowLeft');
await showing('second.png', '2 of 3');
step = 'dot';
await page.getByRole('button', { name: 'Image 1 of 3' }).click();
await showing('first.png', '1 of 3');
console.log('steps: arrows, keys and dots move through all three, wrapping at the ends');

step = 'swipe';
// A leftward swipe on a touchscreen moves on one.
await page.evaluate(() => {
  const popup = document.querySelector('[role="dialog"]');
  const at = (type, x) => popup.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', clientX: x, clientY: 450, bubbles: true }));
  at('pointerdown', 900);
  at('pointerup', 700);
});
await showing('second.png', '2 of 3');
console.log('swipe: a leftward swipe moves on one');

// A click on the picture leaves it open; a click on the dim puts it away.
await dialog.locator('img').click();
await page.waitForTimeout(300);
if (!(await dialog.isVisible())) fail('a click on the picture itself closed the viewer');
const img = await dialog.locator('img').boundingBox();
await page.mouse.click(Math.max(8, img.x - 160), img.y + img.height / 2);
await dialog.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => fail('a click on the dim around the picture did not close the viewer'));
await open('third.png').click();
await showing('third.png', '3 of 3');
await page.mouse.click(1400, 860);
await dialog.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => fail('a click in the corner of the dim did not close the viewer'));
await open('first.png').click();
await showing('first.png');
await page.keyboard.press('Escape');
await dialog.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => fail('Escape did not close the viewer'));
console.log('close: a click on the picture keeps it; the dim around it and Escape put it away');

// One picture on its own: no arrows, no count.
await open('alone.png').click();
await showing('alone.png');
if (await page.getByRole('button', { name: 'Next image' }).count()) fail('a single picture shows a next arrow');
if (await dialog.locator('[data-num]').count()) fail('a single picture shows a count');
await page.keyboard.press('Escape');
console.log('single: one picture opens with no arrows or count');

await browser.close();
if (errors.length) fail(`page errors:\n${errors.slice(0, 5).join('\n')}`);
console.log('LIGHTBOX_OK');
