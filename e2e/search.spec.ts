import { expect, type Page, test } from '@playwright/test';
import { io } from 'socket.io-client';

const run = Date.now().toString(36);
// A word no other test or seed message will ever contain.
const rare = `quarry${run}`;

async function register(page: Page, first: string) {
  const handle = `${first.toLowerCase()}_${run}`.slice(0, 24);
  const res = await page.request.post('/api/auth/register', {
    data: { email: `${handle}@example.test`, handle, displayName: `${first} ${run}`, password: 'correct horse battery' },
  });
  expect(res.status()).toBe(201);
  return { handle, name: `${first} ${run}`, token: (await res.json()).accessToken as string };
}

/** Sends messages over the real socket, as the app does, taking turns between people. */
async function sendInTurns(baseURL: string, tokens: string[], channelId: string, bodies: string[]) {
  const sockets = await Promise.all(
    tokens.map(
      (token) =>
        new Promise<ReturnType<typeof io>>((resolve, reject) => {
          const socket = io(process.env.E2E_SOCKET_URL ?? baseURL, { transports: ['websocket'], auth: { token }, forceNew: true });
          socket.once('session:ready', () => resolve(socket));
          socket.once('connect_error', reject);
        }),
    ),
  );
  for (const [i, body] of bodies.entries()) {
    const socket = sockets[i % sockets.length]!;
    const ack = (await socket.timeout(5000).emitWithAck('message:send', { clientId: crypto.randomUUID(), channelId, body })) as { ok: boolean; error?: string };
    if (!ack.ok) throw new Error(ack.error);
  }
  for (const s of sockets) s.disconnect();
}

const palette = (p: Page) => p.getByRole('dialog', { name: 'Command palette' });
const paletteInput = (p: Page) => palette(p).getByRole('combobox', { name: 'Jump to, search or run a command' });

test('Ctrl+K jumps to channels, people and messages, even ones older than the loaded history', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ben = await ctx.newPage();
  const ada = await register(ben, 'Ada');
  const cy = await register(ben, 'Cy');
  const benUser = await register(ben, 'Ben');

  const auth = { Authorization: `Bearer ${ada.token}` };
  const slug = `search-${run}`.slice(0, 32);
  const created = await ben.request.post('/api/nooks', { headers: auth, data: { name: 'Search', slug, kit: { field: '#1f4e79', mark: '#f28c28' } } });
  const general = ((await created.json()).channels as { id: string; name: string }[]).find((c) => c.name === 'general')!.id;
  const gear = (await (await ben.request.post(`/api/nooks/${slug}/channels`, { headers: auth, data: { name: 'gear-talk' } })).json()).id as string;
  const code = (await (await ben.request.post(`/api/nooks/${slug}/invites`, { headers: auth, data: {} })).json()).code as string;
  for (const u of [cy, benUser]) {
    expect((await ben.request.post(`/api/invites/${code}/accept`, { headers: { Authorization: `Bearer ${u.token}` } })).status()).toBe(200);
  }

  // One message with a rare word, then 51 newer ones: more than the 50 the channel first loads.
  // Authors take turns so every row is full height (and the send limit of 20 per person holds).
  const filler = Array.from({ length: 51 }, (_, i) => `filler message ${i}`);
  await sendInTurns(baseURL!, [ada.token, cy.token, benUser.token], general, [`The ${rare} route opens on Saturday`, ...filler]);

  await ben.goto(`/app/${slug}/${general}`);
  // First load of a channel with 50+ messages: allow for a busy machine, it's not what this test is about.
  await expect(ben.getByTestId('virtuoso-item-list')).toContainText('filler message 50', { timeout: 15_000 });
  // The rare message is beyond the first page: the channel hasn't loaded it.
  await ben.waitForTimeout(500);
  const firstPage = await ben.evaluate(() => performance.getEntriesByType('resource').filter((e) => /\/messages\?/.test(e.name)).map((e) => e.name));
  expect(firstPage.some((u) => u.includes('before='))).toBe(false);

  // Jump to a channel by a few letters.
  await ben.keyboard.press('Control+k');
  await expect(palette(ben)).toBeVisible();
  await paletteInput(ben).pressSequentially('gear');
  await expect(palette(ben).getByRole('option', { name: '#gear-talk' })).toHaveAttribute('aria-selected', 'true');
  await ben.keyboard.press('Enter');
  await expect(ben).toHaveURL(new RegExp(`/app/${slug}/${gear}$`));
  await expect(palette(ben)).toBeHidden();

  // Find the old message and land on it, in view, though it was never loaded.
  await ben.keyboard.press('Control+k');
  await paletteInput(ben).pressSequentially(rare);
  const hit = palette(ben).getByRole('option', { name: new RegExp(`^${ada.name}: .*${rare}`) });
  await expect(hit).toBeVisible();
  await expect(hit).toHaveAttribute('aria-selected', 'true');
  await expect(hit.locator('mark')).toHaveText(rare);
  await ben.keyboard.press('Enter');
  await expect(ben).toHaveURL(new RegExp(`/app/${slug}/${general}\\?m=[0-9a-f-]{36}$`));
  const target = ben.getByTestId('virtuoso-item-list').getByRole('article').filter({ hasText: rare });
  await expect(target).toBeInViewport();

  // Message a person straight from the palette.
  await ben.keyboard.press('Control+k');
  await paletteInput(ben).pressSequentially('ada');
  await expect(palette(ben).getByRole('option', { name: `Message ${ada.name}` })).toBeVisible();
  await ben.keyboard.press('ArrowDown');
  await ben.keyboard.press('ArrowUp');
  await expect(palette(ben).getByRole('option', { name: `Message ${ada.name}` })).toHaveAttribute('aria-selected', 'true');
  await ben.keyboard.press('Enter');
  await expect(ben.getByRole('heading', { level: 1 })).toContainText(ada.name);

  // All results for a common word: a column beside the conversation, highlighted and paged.
  await ben.keyboard.press('Control+k');
  await paletteInput(ben).pressSequentially('filler');
  await palette(ben).getByRole('option', { name: /See all results for filler/ }).click();
  const column = ben.getByRole('complementary', { name: 'Search' });
  const results = column.getByRole('list', { name: 'Results' }).getByRole('listitem');
  await expect(results).toHaveCount(20);
  await expect(results.first().locator('mark')).toHaveText('filler');
  await column.getByRole('button', { name: 'Show older results' }).click();
  await expect(results).toHaveCount(40);
  // Picking a result keeps the column open and brings the message into view.
  await results.nth(35).getByRole('link').click();
  await expect(ben).toHaveURL(/[?&]q=filler/);
  await expect(results.nth(35).getByRole('link')).toHaveAttribute('aria-current', 'true');
  const picked = (await results.nth(35).locator('mark').first().evaluate((el) => el.parentElement!.textContent)) ?? '';
  await expect(ben.getByTestId('virtuoso-item-list').getByRole('article').filter({ hasText: picked.trim() })).toBeInViewport();
});
