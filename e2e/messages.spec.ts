import { randomUUID } from 'node:crypto';
import { type APIRequestContext, type Browser, expect, type Page, test } from '@playwright/test';
import { io } from 'socket.io-client';

const run = Date.now().toString(36);
let seq = 0;

interface Person {
  name: string;
  token: string;
  page: Page;
}

/** Registers through the API in a fresh browser context, so the page is signed in. */
async function person(browser: Browser, first: string): Promise<Person> {
  const page = await (await browser.newContext()).newPage();
  const n = ++seq;
  const handle = `${first.toLowerCase()}${n}_${run}`.slice(0, 24);
  const name = `${first} ${run}`;
  const res = await page.request.post('/api/auth/register', {
    data: { email: `${handle}@example.test`, handle, displayName: name, password: 'correct horse battery' },
  });
  expect(res.status()).toBe(201);
  return { name, token: (await res.json()).accessToken as string, page };
}

const bearer = (p: Person) => ({ Authorization: `Bearer ${p.token}` });

/** Founder starts a nook; everyone else joins by invite. Returns the nook slug and #general's id. */
async function nookWith(request: APIRequestContext, founder: Person, others: Person[]) {
  const slug = `talk-${run}-${++seq}`.slice(0, 32);
  const created = await request.post('/api/nooks', { headers: bearer(founder), data: { name: `Talk ${seq}`, slug, kit: { field: '#0f5257', mark: '#f4d35e' } } });
  expect(created.status()).toBe(201);
  const general = ((await created.json()).channels as { id: string; name: string }[]).find((c) => c.name === 'general')!.id;
  for (const o of others) {
    const code = (await (await request.post(`/api/nooks/${slug}/invites`, { headers: bearer(founder), data: {} })).json()).code as string;
    expect((await request.post(`/api/invites/${code}/accept`, { headers: bearer(o) })).status()).toBe(200);
  }
  return { slug, general };
}

const transcript = (p: Page) => p.getByTestId('virtuoso-item-list');
const composer = (p: Page) => p.getByRole('textbox', { name: 'Message #general' });

async function say(p: Page, text: string) {
  await composer(p).fill(text);
  await composer(p).press('Enter');
}

test('two people chat live; edits and deletes reach the other side', async ({ browser, request }) => {
  const [ana, ben] = await Promise.all([person(browser, 'Ana'), person(browser, 'Ben')]);
  const { slug, general } = await nookWith(request, ana, [ben]);
  await Promise.all([ana.page.goto(`/app/${slug}/${general}`), ben.page.goto(`/app/${slug}/${general}`)]);

  // Ben sees Ana's join line, then a live message; Ana sees Ben's reply.
  await expect(transcript(ana.page)).toContainText(`${ben.name} joined the nook`);
  await say(ana.page, 'Morning! Anyone up for **coffee**?');
  await expect(transcript(ben.page).getByText('Morning! Anyone up for')).toBeVisible();
  await expect(transcript(ben.page).locator('strong', { hasText: 'coffee' })).toBeVisible();
  await say(ben.page, 'Always. The place with the `good` croissants?');
  await expect(transcript(ana.page).getByText('The place with the')).toBeVisible();

  // Ana edits her message; Ben sees the new text and the edited marker.
  const mine = transcript(ana.page).getByRole('article').filter({ hasText: 'Morning! Anyone up for' });
  await mine.hover();
  await mine.getByRole('button', { name: 'Edit message' }).click();
  const edit = ana.page.getByRole('textbox', { name: 'Edit message' });
  await edit.fill('Morning! Anyone up for tea instead?');
  await edit.press('Enter');
  await expect(transcript(ben.page).getByText('Morning! Anyone up for tea instead?')).toBeVisible();
  await expect(transcript(ben.page).getByText('(edited)')).toBeVisible();

  // Ben deletes his reply after confirming; Ana sees it go.
  const reply = transcript(ben.page).getByRole('article').filter({ hasText: 'The place with the' });
  await reply.hover();
  await reply.getByRole('button', { name: 'Delete message' }).click();
  await ben.page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(transcript(ana.page).getByText('Message deleted')).toBeVisible();
  await expect(transcript(ana.page).getByText('The place with the')).toHaveCount(0);
});

test('older history loads when you scroll up', async ({ browser, request, baseURL }) => {
  const people = await Promise.all([person(browser, 'Cleo'), person(browser, 'Dan'), person(browser, 'Eve')]);
  const [cleo] = people;
  const { slug, general } = await nookWith(request, cleo!, people.slice(1));

  // 57 messages, 19 per person to stay inside the per-user send limit.
  let n = 0;
  for (const p of people) {
    // Same origin through nginx; a local `next dev` can't proxy websockets, so allow pointing at the api.
    const socket = io(process.env.E2E_REALTIME_URL ?? baseURL!, { transports: ['websocket'], auth: { token: p.token }, forceNew: true });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    for (let i = 0; i < 19; i++) {
      const label = `history line ${String(++n).padStart(2, '0')}`;
      const ack = await socket.timeout(5000).emitWithAck('message:send', { clientId: randomUUID(), channelId: general, body: label });
      expect(ack.ok, JSON.stringify(ack)).toBe(true);
    }
    socket.disconnect();
  }

  const page = cleo!.page;
  await page.goto(`/app/${slug}/${general}`);
  await expect(transcript(page).getByText('history line 57')).toBeVisible();
  // The first page holds the newest 50 (plus the join lines); the oldest lines are not loaded yet.
  await expect(page.getByText('history line 01')).toHaveCount(0);

  // Scroll to the top until the channel's very start appears.
  const scroller = page.locator('[data-virtuoso-scroller="true"]');
  for (let i = 0; i < 15 && (await page.getByRole('heading', { name: '#general' }).count()) === 0; i++) {
    await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
    await page.waitForTimeout(250);
  }
  await expect(page.getByText('history line 01')).toBeVisible();
  await expect(page.getByRole('heading', { name: '#general' })).toBeVisible();
});

test('a message sent offline fails visibly, then goes out exactly once', async ({ browser, request }) => {
  const [fay] = await Promise.all([person(browser, 'Fay')]);
  const { slug, general } = await nookWith(request, fay!, []);
  const page = fay!.page;
  await page.goto(`/app/${slug}/${general}`);
  await expect(composer(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: '#general' })).toBeVisible();

  await page.context().setOffline(true);
  await say(page, 'written on the train');
  await expect(page.getByText('Didn’t send.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Reconnecting' })).toBeVisible();

  await page.context().setOffline(false);
  // Reconnecting refetches the channel. The message must never silently vanish in that refetch:
  // either the queued frame goes out on reconnect, or it stays on screen with Retry.
  await expect(page.getByRole('status').filter({ hasText: 'Reconnecting' })).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(1500);
  await expect(transcript(page).getByText('written on the train')).toHaveCount(1);
  const retry = page.getByRole('button', { name: 'Retry' });
  if (await retry.count()) await retry.click();
  await expect(page.getByText('Didn’t send.')).toHaveCount(0, { timeout: 15_000 });

  await page.reload();
  await expect(transcript(page).getByText('written on the train')).toHaveCount(1);
});

test('a lost send survives the reconnect refetch and can be retried', async ({ browser, request }) => {
  const [gus] = await Promise.all([person(browser, 'Gus')]);
  const { slug, general } = await nookWith(request, gus!, []);
  const page = gus!.page;

  // Sit between the page and the socket server: drop the first send, and be able to cut the line.
  let current: { close: () => Promise<void> } | null = null;
  let dropped = false;
  await page.routeWebSocket(/socket\.io/, (ws) => {
    const server = ws.connectToServer();
    current = ws;
    ws.onMessage((m) => {
      if (!dropped && String(m).includes('"message:send"')) {
        dropped = true; // lost in transit: the server never hears of it
        return;
      }
      server.send(m);
    });
    server.onMessage((m) => ws.send(m));
  });

  await page.goto(`/app/${slug}/${general}`);
  await expect(page.getByRole('heading', { name: '#general' })).toBeVisible();
  await say(page, 'lost in a tunnel');
  await expect(page.getByText('Didn’t send.')).toBeVisible({ timeout: 15_000 });

  // Reconnect: the client refetches the channel. The unsent message must still be there.
  await current!.close();
  await page.waitForTimeout(2500);
  await expect(page.getByText('Didn’t send.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Didn’t send.')).toHaveCount(0, { timeout: 15_000 });

  await page.reload();
  await expect(transcript(page).getByText('lost in a tunnel')).toHaveCount(1);
});


test('a message sent while the tab is still connecting is not lost', async ({ browser, request }) => {
  const [ada, ben] = await Promise.all([person(browser, 'Ada'), person(browser, 'Ben')]);
  const { slug, general } = await nookWith(request, ada!, [ben!]);

  // Hold Ada's socket back until her history has loaded and Ben has spoken: the gap between the
  // first page of messages and the socket joining its rooms.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await ada!.page.routeWebSocket(/socket\.io/, (ws) => {
    void gate.then(() => {
      const server = ws.connectToServer();
      ws.onMessage((m) => server.send(m));
      server.onMessage((m) => ws.send(m));
    });
  });

  await Promise.all([ada!.page.goto(`/app/${slug}/${general}`), ben!.page.goto(`/app/${slug}/${general}`)]);
  await expect(transcript(ada!.page).getByText(/opened the channel/i)).toBeVisible();
  await say(ben!.page, 'said while you were connecting');
  await expect(transcript(ben!.page).getByText('said while you were connecting')).toBeVisible();

  release();
  await expect(transcript(ada!.page).getByText('said while you were connecting')).toBeVisible({ timeout: 10_000 });
});
