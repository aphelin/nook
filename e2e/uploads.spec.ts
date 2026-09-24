import { crc32, deflateSync } from 'node:zlib';
import { expect, type Page, test } from '@playwright/test';

const run = Date.now().toString(36);

/** A solid-colour RGB PNG, built by hand so the test needs no image library. */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
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
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [31, 78, 121]).flat())]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function register(page: Page, first: string) {
  const handle = `${first.toLowerCase()}_${run}`.slice(0, 24);
  const res = await page.request.post('/api/auth/register', {
    data: { email: `${handle}@example.test`, handle, displayName: `${first} ${run}`, password: 'correct horse battery' },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).accessToken as string;
}

const transcript = (p: Page) => p.getByTestId('virtuoso-item-list');

test('an image goes up, arrives at its real proportions, and opens full size; a link gets a card', async ({ browser }) => {
  test.setTimeout(90_000);
  const kim = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const leo = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const kimToken = await register(kim, 'Kim');
  const leoToken = await register(leo, 'Leo');

  const auth = { Authorization: `Bearer ${kimToken}` };
  const slug = `uploads-${run}`.slice(0, 32);
  const created = await kim.request.post('/api/nooks', { headers: auth, data: { name: 'Uploads', slug, kit: { field: '#0f5257', mark: '#f4d35e' } } });
  const general = ((await created.json()).channels as { id: string; name: string }[]).find((c) => c.name === 'general')!.id;
  const code = (await (await kim.request.post(`/api/nooks/${slug}/invites`, { headers: auth, data: {} })).json()).code as string;
  expect((await leo.request.post(`/api/invites/${code}/accept`, { headers: { Authorization: `Bearer ${leoToken}` } })).status()).toBe(200);
  await Promise.all([kim.goto(`/app/${slug}/${general}`), leo.goto(`/app/${slug}/${general}`)]);

  // Kim attaches a 300×150 image; the chip uploads it straight to storage.
  await kim.locator('input[type="file"]').first().setInputFiles({ name: 'wall.png', mimeType: 'image/png', buffer: png(300, 150) });
  await expect(kim.getByRole('list', { name: 'Attached files' })).toContainText('wall.png');
  const send = kim.getByRole('button', { name: 'Send message' });
  await expect(send).toBeEnabled({ timeout: 15_000 });
  await kim.getByRole('textbox', { name: 'Message #general' }).fill('New problem on the slab');
  await send.click();

  // Leo sees it at 2:1 once the worker has measured it, and can open it full size.
  const image = transcript(leo).getByRole('img', { name: 'wall.png' });
  await expect(image).toBeVisible({ timeout: 20_000 });
  const box = (await image.boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(2, 1);
  await transcript(leo).getByRole('button', { name: 'Open wall.png' }).click();
  await expect(leo.getByRole('dialog', { name: 'wall.png' })).toBeVisible();
  await leo.keyboard.press('Escape');

  // A link gets a preview card, fetched by the worker from the public internet.
  await kim.getByRole('textbox', { name: 'Message #general' }).fill('Reference: https://example.com');
  await kim.getByRole('textbox', { name: 'Message #general' }).press('Enter');
  await expect(transcript(leo).getByRole('link', { name: /Example Domain/ })).toBeVisible({ timeout: 30_000 });
});
