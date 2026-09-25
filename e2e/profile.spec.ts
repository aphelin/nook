import { expect, type Page, test } from '@playwright/test';

const run = Date.now().toString(36);
// A 1×1 PNG; the server crops and scales it to 256×256.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

async function register(page: Page, first: string) {
  const handle = `${first.toLowerCase()}_${run}`.slice(0, 24);
  const res = await page.request.post('/api/auth/register', {
    data: { email: `${handle}@example.test`, handle, displayName: `${first} ${run}`, password: 'correct horse battery' },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  return { handle, name: `${first} ${run}`, id: body.user.id as string, token: body.accessToken as string };
}

const transcript = (p: Page) => p.getByTestId('virtuoso-item-list');

test('a profile edit reaches a teammate live, and their card opens from a message and the member sheet', async ({ browser }) => {
  test.setTimeout(90_000);
  const ada = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const ben = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const adaUser = await register(ada, 'Ada');
  const benUser = await register(ben, 'Ben');

  const auth = { Authorization: `Bearer ${adaUser.token}` };
  const slug = `profiles-${run}`.slice(0, 32);
  const created = await ada.request.post('/api/nooks', { headers: auth, data: { name: 'Profiles', slug, kit: { field: '#7a1f2b', mark: '#e8c872' } } });
  const general = ((await created.json()).channels as { id: string; name: string }[]).find((c) => c.name === 'general')!.id;
  const code = (await (await ada.request.post(`/api/nooks/${slug}/invites`, { headers: auth, data: {} })).json()).code as string;
  expect((await ben.request.post(`/api/invites/${code}/accept`, { headers: { Authorization: `Bearer ${benUser.token}` } })).status()).toBe(200);

  await Promise.all([ada.goto(`/app/${slug}/${general}`), ben.goto(`/app/${slug}/${general}`)]);
  await ben.getByRole('textbox', { name: 'Message #general' }).fill('Evening, all');
  await ben.getByRole('textbox', { name: 'Message #general' }).press('Enter');
  const bensRow = transcript(ada).getByRole('article').filter({ hasText: 'Evening, all' });
  await expect(bensRow).toBeVisible();

  // Ben edits his profile from the account menu.
  await ben.getByRole('button', { name: `Account: ${benUser.name}` }).click();
  await ben.getByRole('menuitem', { name: 'Edit profile' }).click();
  const dialog = ben.getByRole('dialog', { name: 'Edit profile' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Choose a photo').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
  await expect(dialog.getByRole('button', { name: 'Change photo' })).toBeVisible();
  await dialog.getByText('he/him', { exact: true }).click();
  await expect(dialog.getByRole('radio', { name: 'he/him' })).toBeChecked();
  // Only the two sets are offered; there is no free-text field to type anything else into.
  await expect(dialog.getByRole('radiogroup', { name: 'Pronouns' }).getByRole('radio')).toHaveCount(3);
  await dialog.getByLabel('Bio').fill('Sets the routes on Thursdays.');
  await dialog.getByRole('button', { name: 'Pick a status emoji' }).click();
  await ben.getByRole('searchbox', { name: 'Search emoji' }).fill('thumbs up');
  await ben.getByRole('gridcell', { name: 'Thumbs up', exact: true }).click();
  await dialog.getByLabel('Status text').fill('At the wall');
  await dialog.getByText('1 hour').click();
  // The preview card follows along before anything is saved.
  await expect(dialog.getByRole('region', { name: 'How others see you' })).toContainText('Sets the routes on Thursdays.');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  // Ada sees it without reloading: the status beside his name and his new photo.
  await expect(bensRow.getByRole('img', { name: 'Status: At the wall' })).toBeVisible();
  const photo = bensRow.locator(`img[src^="/api/users/${benUser.id}/avatar"]`);
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(256);

  // Keyboard: focus his name and press Enter; the card shows his bio, pronouns and status.
  await bensRow.getByRole('button', { name: `${benUser.name}, view profile` }).focus();
  await ada.keyboard.press('Enter');
  const card = ada.getByRole('dialog', { name: benUser.name });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Sets the routes on Thursdays.');
  await expect(card).toContainText('he/him');
  await expect(card).toContainText('At the wall');
  await ada.keyboard.press('Escape');
  await expect(card).toBeHidden();

  // Hovering him in the who's-here strip opens the same card; Message opens the DM.
  await ada
    .getByRole('list', { name: "Who's here" })
    .getByRole('button', { name: new RegExp(`^${benUser.name}, .*view profile$`) })
    .hover();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Message' }).click();
  await expect(ada.getByRole('heading', { level: 1 })).toContainText(benUser.name);
});

test('choosing a face reaches a teammate live, survives a reload, and goes back to the generated one', async ({ browser }) => {
  test.setTimeout(90_000);
  const ada = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const ben = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const adaUser = await register(ada, 'Cleo');
  const benUser = await register(ben, 'Dev');
  const auth = { Authorization: `Bearer ${adaUser.token}` };
  const slug = `faces-${run}`.slice(0, 32);
  const created = await ada.request.post('/api/nooks', { headers: auth, data: { name: 'Faces', slug, kit: { field: '#1f4e79', mark: '#f28c28' } } });
  const general = ((await created.json()).channels as { id: string; name: string }[]).find((c) => c.name === 'general')!.id;
  const code = (await (await ada.request.post(`/api/nooks/${slug}/invites`, { headers: auth, data: {} })).json()).code as string;
  expect((await ben.request.post(`/api/invites/${code}/accept`, { headers: { Authorization: `Bearer ${benUser.token}` } })).status()).toBe(200);
  await Promise.all([ada.goto(`/app/${slug}/${general}`), ben.goto(`/app/${slug}/${general}`)]);

  const adaOnRail = ada.getByRole('button', { name: `Account: ${adaUser.name}` }).locator('svg[data-face]');
  const adaForBen = ben
    .getByRole('list', { name: "Who's here" })
    .getByRole('button', { name: new RegExp(`^${adaUser.name}, .*view profile$`) })
    .locator('svg[data-face]');
  await expect(adaForBen).toBeVisible();
  const given = (await adaOnRail.getAttribute('data-face'))!;
  const pick = given === 'burst' ? 'crown' : 'burst';

  // Ada picks a shape and a colour; the preview follows before anything is saved.
  await ada.getByRole('button', { name: `Account: ${adaUser.name}` }).click();
  await ada.getByRole('menuitem', { name: 'Edit profile' }).click();
  const dialog = ada.getByRole('dialog', { name: 'Edit profile' });
  const shapes = dialog.getByRole('radiogroup', { name: 'Shape' });
  await expect(shapes.getByRole('radio')).toHaveCount(21);
  await expect(shapes.getByRole('radio', { checked: true })).toHaveCount(1);
  // Press the shapes themselves, as a person would: the radios are visually hidden inside them.
  const option = (group: string, name: string) =>
    dialog.getByRole('radiogroup', { name: group }).locator('label', { has: ada.getByRole('radio', { name, exact: true }) });
  await option('Shape', pick === 'burst' ? 'Burst' : 'Crown').click();
  // Colours are said as what they are in this nook, never "Colour 2".
  const colours = dialog.getByRole('radiogroup', { name: 'Colour' });
  await expect(colours.getByRole('radio').nth(1)).toHaveAccessibleName(/^[A-Z][a-z -]+, with a [a-z -]+ initial$/);
  await colours.locator('label').nth(1).click();
  await expect(colours.getByRole('radio').nth(1)).toBeChecked();
  await expect(shapes.getByRole('radio', { name: pick === 'burst' ? 'Burst' : 'Crown' })).toBeChecked();
  await expect(dialog.getByRole('region', { name: 'How others see you' }).locator('svg[data-face]').first()).toHaveAttribute('data-face', pick);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  // Her own rail, and Ben's screen without a reload.
  await expect(adaOnRail).toHaveAttribute('data-face', pick);
  await expect(adaOnRail).toHaveAttribute('data-tone', '2');
  await expect(adaForBen).toHaveAttribute('data-face', pick);
  await expect(adaForBen).toHaveAttribute('data-tone', '2');

  // It is stored: a reload keeps it, and the picker opens on it.
  await ada.reload();
  await expect(adaOnRail).toHaveAttribute('data-face', pick);
  await ada.getByRole('button', { name: `Account: ${adaUser.name}` }).click();
  await ada.getByRole('menuitem', { name: 'Edit profile' }).click();
  await expect(shapes.getByRole('radio', { name: pick === 'burst' ? 'Burst' : 'Crown' })).toBeChecked();

  // And back to the one her handle gives her.
  await dialog.getByRole('button', { name: 'Use the one I was given' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(adaOnRail).toHaveAttribute('data-face', given);
  await expect(adaForBen).toHaveAttribute('data-face', given);
});
