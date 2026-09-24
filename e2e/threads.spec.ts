import { expect, type Page, test } from '@playwright/test';

const run = Date.now().toString(36);

async function register(page: Page, first: string) {
  const handle = `${first.toLowerCase()}_${run}`.slice(0, 24);
  const res = await page.request.post('/api/auth/register', {
    data: { email: `${handle}@example.test`, handle, displayName: `${first} ${run}`, password: 'correct horse battery' },
  });
  expect(res.status()).toBe(201);
  return { name: `${first} ${run}`, token: (await res.json()).accessToken as string };
}

const transcript = (p: Page) => p.getByTestId('virtuoso-item-list');
const threadPanel = (p: Page) => p.getByRole('complementary', { name: 'Thread' });

test('a thread and a reaction travel both ways, live', async ({ browser }) => {
  test.setTimeout(90_000);
  const ivy = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const jay = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const ivyUser = await register(ivy, 'Ivy');
  const jayUser = await register(jay, 'Jay');

  const auth = { Authorization: `Bearer ${ivyUser.token}` };
  const slug = `threads-${run}`.slice(0, 32);
  const created = await ivy.request.post('/api/nooks', { headers: auth, data: { name: 'Threads', slug, kit: { field: '#7a1f2b', mark: '#e8c872' } } });
  const general = ((await created.json()).channels as { id: string; name: string }[]).find((c) => c.name === 'general')!.id;
  const code = (await (await ivy.request.post(`/api/nooks/${slug}/invites`, { headers: auth, data: {} })).json()).code as string;
  expect((await jay.request.post(`/api/invites/${code}/accept`, { headers: { Authorization: `Bearer ${jayUser.token}` } })).status()).toBe(200);

  await Promise.all([ivy.goto(`/app/${slug}/${general}`), jay.goto(`/app/${slug}/${general}`)]);
  await ivy.getByRole('textbox', { name: 'Message #general' }).fill('Book pick for next month?');
  await ivy.getByRole('textbox', { name: 'Message #general' }).press('Enter');

  // Jay opens a thread from the hover toolbar and replies.
  const root = transcript(jay).getByRole('article').filter({ hasText: 'Book pick for next month?' });
  await root.hover();
  await root.getByRole('button', { name: 'Reply in thread' }).click();
  await expect(jay).toHaveURL(/\?thread=[0-9a-f-]{36}$/);
  await threadPanel(jay).getByRole('textbox', { name: 'Reply…' }).fill('Piranesi, obviously');
  await threadPanel(jay).getByRole('textbox', { name: 'Reply…' }).press('Enter');
  await expect(threadPanel(jay)).toContainText('Piranesi, obviously');

  // Ivy sees the summary arrive, opens the thread from it, and answers.
  const summary = transcript(ivy).getByRole('button', { name: /1 reply/ });
  await expect(summary).toBeVisible();
  await summary.click();
  await expect(threadPanel(ivy)).toContainText('Piranesi, obviously');
  await threadPanel(ivy).getByRole('textbox', { name: 'Reply…' }).fill('Seconded.');
  await threadPanel(ivy).getByRole('textbox', { name: 'Reply…' }).press('Enter');
  await expect(threadPanel(jay)).toContainText('Seconded.');
  await expect(transcript(jay).getByRole('button', { name: /2 replies/ })).toBeVisible();
  // The reply stays in the thread, not the channel.
  await expect(transcript(jay).getByText('Seconded.')).toHaveCount(0);

  // Jay reacts from the picker; Ivy sees it and adds hers by clicking the pill.
  await root.hover();
  await root.getByRole('button', { name: 'Add a reaction' }).click();
  await jay.getByRole('searchbox', { name: 'Search emoji' }).fill('thumbs up');
  await jay.getByRole('gridcell', { name: 'Thumbs up', exact: true }).click();
  // The picker returns the emoji with its variation selector (U+FE0F); keep matching tolerant of it.
  const pill = transcript(ivy).getByRole('button', { name: /^👍\uFE0F? 1:/u });
  await expect(pill).toBeVisible();
  await expect(pill).toHaveAttribute('aria-pressed', 'false');
  await pill.click();
  const both = transcript(jay).getByRole('button', { name: /^👍\uFE0F? 2:/u });
  await expect(both).toBeVisible();
  await expect(both).toHaveAttribute('aria-pressed', 'true');
});
