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

test('someone comes on, types, goes do-not-disturb, and drops to offline', async ({ browser }) => {
  const halCtx = await browser.newContext();
  const hal = await halCtx.newPage();
  const halUser = await register(hal, 'Hal');
  const gilCtx = await browser.newContext();
  const gil = await gilCtx.newPage();
  const gilUser = await register(gil, 'Gil');

  // Hal starts a nook and invites Gil.
  const auth = { Authorization: `Bearer ${halUser.token}` };
  const slug = `presence-${run}`.slice(0, 32);
  const created = await hal.request.post('/api/nooks', { headers: auth, data: { name: 'Presence', slug, kit: { field: '#3d2c6b', mark: '#8fe3b0' } } });
  const general = ((await created.json()).channels as { id: string; name: string }[]).find((c) => c.name === 'general')!.id;
  const code = (await (await hal.request.post(`/api/nooks/${slug}/invites`, { headers: auth, data: {} })).json()).code as string;
  expect((await gil.request.post(`/api/invites/${code}/accept`, { headers: { Authorization: `Bearer ${gilUser.token}` } })).status()).toBe(200);

  await hal.goto(`/app/${slug}/${general}`);
  // The who's-here strip across the top of the room names each person's state, not just its ring.
  const strip = hal.getByRole('list', { name: "Who's here" });
  const person = (name: string, state: string) =>
    strip.getByRole('button', { name: new RegExp(`^${name}( \\(you\\))?, ${state}, view profile$`) });
  await expect(person(halUser.name, 'Online')).toBeVisible();
  await expect(person(gilUser.name, 'Offline')).toBeVisible();

  // Gil opens the app: Hal sees him come on.
  await gil.goto(`/app/${slug}/${general}`);
  await expect(person(gilUser.name, 'Online')).toBeVisible();

  // Gil types: Hal sees it.
  await gil.getByRole('textbox', { name: 'Message #general' }).fill('about to say something');
  await expect(hal.getByText(`Gil is typing…`)).toBeVisible();

  // Gil chooses do-not-disturb from his account menu: Hal sees it named, not just coloured.
  await gil.getByRole('button', { name: /^Account:/ }).first().click();
  await gil.getByRole('menuitemradio', { name: /Do not disturb/ }).click();
  await expect(person(gilUser.name, 'Do not disturb')).toBeVisible();

  // Gil leaves: he drops to offline.
  await gilCtx.close();
  await expect(person(gilUser.name, 'Offline')).toBeVisible();
});
