import { expect, type Page, test } from '@playwright/test';

const run = Date.now().toString(36);

async function register(page: Page, first: string) {
  const handle = `${first.toLowerCase()}_${run}`.slice(0, 24);
  const res = await page.request.post('/api/auth/register', {
    data: { email: `${handle}@example.test`, handle, displayName: `${first} ${run}`, password: 'correct horse battery' },
  });
  expect(res.status()).toBe(201);
  return { handle, name: `${first} ${run}`, token: (await res.json()).accessToken as string };
}

const channels = (p: Page) => p.getByRole('navigation', { name: /channels$/ });

test('a mention picked from the autocomplete reaches the teammate: the channel stands out, count, inbox, and back to read', async ({ browser }) => {
  test.setTimeout(90_000);
  const ada = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const ben = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const adaUser = await register(ada, 'Ada');
  const benUser = await register(ben, 'Ben');

  const auth = { Authorization: `Bearer ${adaUser.token}` };
  const slug = `mentions-${run}`.slice(0, 32);
  const created = await ada.request.post('/api/nooks', { headers: auth, data: { name: 'Mentions', slug, kit: { field: '#1b1d24', mark: '#ff5a36' } } });
  const general = ((await created.json()).channels as { id: string; name: string }[]).find((c) => c.name === 'general')!.id;
  const code = (await (await ada.request.post(`/api/nooks/${slug}/invites`, { headers: auth, data: {} })).json()).code as string;
  expect((await ben.request.post(`/api/invites/${code}/accept`, { headers: { Authorization: `Bearer ${benUser.token}` } })).status()).toBe(200);
  const plans = (await (await ada.request.post(`/api/nooks/${slug}/channels`, { headers: auth, data: { name: 'plans' } })).json()).id as string;

  await Promise.all([ada.goto(`/app/${slug}/${plans}`), ben.goto(`/app/${slug}/${general}`)]);
  const plansLink = channels(ben).getByRole('link', { name: /^plans/ });
  await expect(plansLink).not.toHaveAttribute('data-unread');
  // How a read, unselected channel is set, so the change can be measured against it. (The
  // selected channel is also set heavy, so comparing two rows would prove nothing.)
  const style = () => plansLink.evaluate((el) => ({ weight: Number(getComputedStyle(el).fontWeight), color: getComputedStyle(el).color }));
  const read = await style();
  await expect(ben.getByRole('button', { name: 'Inbox' })).toBeVisible();

  // Ada types "@be", picks Ben with the keyboard, and finishes the message.
  const box = ada.getByRole('textbox', { name: 'Message #plans' });
  await box.click();
  await box.pressSequentially('@be');
  const option = ada.getByRole('option', { name: new RegExp(benUser.name) });
  await expect(option).toBeVisible();
  await expect(option).toHaveAttribute('aria-selected', 'true');
  await box.press('Enter');
  await expect(box).toHaveValue(`@${benUser.handle} `);
  await box.pressSequentially('can you book the wall for Friday?');
  await box.press('Enter');
  const sent = ada.getByTestId('virtuoso-item-list').getByRole('article').filter({ hasText: 'can you book the wall' });
  await expect(sent.getByText(`@${benUser.handle}`)).toHaveAttribute('title', benUser.name);

  // Ben: the channel stands out and gains a mention count; the inbox counts it.
  await expect(plansLink).toHaveAttribute('data-unread', '1');
  await expect(plansLink).toHaveAccessibleName(/1 unread, 1 mention/);
  // The same row, now unread: heavier, and lifted from secondary text to full ink.
  await expect.poll(async () => (await style()).weight).toBeGreaterThan(read.weight);
  expect((await style()).color).not.toBe(read.color);
  const inboxButton = ben.getByRole('button', { name: 'Inbox, 1 unread' });
  await expect(inboxButton).toBeVisible();

  // He opens the inbox item: it lands on the message, which is marked as mentioning him, and everything reads as read.
  await inboxButton.click();
  const item = ben.getByRole('link', { name: new RegExp(`${adaUser.name} mentioned you in #plans`) });
  await expect(item).toHaveAttribute('data-unread', 'true');
  await item.click();
  await expect(ben).toHaveURL(new RegExp(`/app/${slug}/${plans}\\?m=[0-9a-f-]{36}$`));
  const arrived = ben.getByTestId('virtuoso-item-list').getByRole('article').filter({ hasText: 'can you book the wall' });
  await expect(arrived).toHaveAttribute('data-mentions-me', 'true');
  await expect(ben.getByRole('button', { name: 'Inbox' })).toBeVisible();
  await expect(plansLink).not.toHaveAttribute('data-unread');

  // Ada's next message in the channel Ben is reading never counts as unread for him.
  await ada.getByRole('textbox', { name: 'Message #plans' }).fill('Thanks!');
  await ada.getByRole('textbox', { name: 'Message #plans' }).press('Enter');
  await expect(ben.getByTestId('virtuoso-item-list')).toContainText('Thanks!');
  await ben.waitForTimeout(800);
  await expect(plansLink).not.toHaveAttribute('data-unread');
  // …and the server agrees: reading the channel moved Ben's pointer past both messages.
  const benAuth = { Authorization: `Bearer ${benUser.token}` };
  await expect
    .poll(async () => {
      const state = (await (await ben.request.get('/api/unread', { headers: benAuth })).json()) as { channels: { channelId: string; unread: number }[]; inbox: number };
      return { unread: state.channels.find((c) => c.channelId === plans)?.unread, inbox: state.inbox };
    })
    .toEqual({ unread: 0, inbox: 0 });
  await ben.goto(`/app/${slug}/${general}`);
  await expect(channels(ben).getByRole('link', { name: /^plans/ })).toBeVisible();
  await expect(channels(ben).getByRole('link', { name: /^plans/ })).not.toHaveAttribute('data-unread');
});
