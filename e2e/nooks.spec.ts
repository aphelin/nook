import { expect, type Page, test } from '@playwright/test';

const run = Date.now().toString(36);

async function signUpViaUi(page: Page, displayName: string, email: string) {
  await page.getByLabel('Display name').fill(displayName);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByRole('button', { name: 'Join Nook' }).click();
}

test('start a nook in its colour, invite someone who joins by link, and DM them', async ({ browser }) => {
  // Two people, many routes: slow against a cold dev server, quick against the production build.
  test.setTimeout(120_000);
  const founderName = `Rosa Founder ${run}`;
  const nookName = `Swim Club ${run}`;

  // Founder: sign up, land on the empty home, start a nook in the "Violet hour" colours.
  const founder = await (await browser.newContext()).newPage();
  await founder.goto('/signup');
  await signUpViaUi(founder, founderName, `rosa-${run}@example.test`);
  await expect(founder.getByRole('heading', { name: /not in a nook yet/i })).toBeVisible();
  await founder.getByRole('link', { name: 'Start a nook' }).first().click();
  await founder.getByLabel('Name', { exact: true }).fill(nookName);
  await founder.getByRole('radio', { name: 'Violet hour' }).click();
  await founder.getByRole('button', { name: 'Start the nook' }).click();

  await expect(founder).toHaveURL(/\/app\/swim-club-[a-z0-9-]+\/[0-9a-f-]{36}$/);
  await expect(founder.getByRole('heading', { level: 1 })).toHaveText('general');
  // The screen takes the chosen kit: violet is the darker colour, so it drenches the rail; mint is
  // the bright one, so it drenches the room. Both are normalised to read, never used raw.
  const rgbOf = async (el: import('@playwright/test').Locator) =>
    (await el.evaluate((e) => getComputedStyle(e).backgroundColor)).match(/\d+/g)!.map(Number);
  const [r, g, b] = await rgbOf(founder.getByRole('navigation', { name: 'Nooks' }));
  expect(b, `a violet nook's rail rgb(${r},${g},${b}) should lean blue`).toBeGreaterThan(g);
  expect(r, `a violet nook's rail rgb(${r},${g},${b}) should carry red`).toBeGreaterThan(g);
  const [sr, sg, sb] = await rgbOf(founder.getByTestId('shell'));
  expect(sg, `its room rgb(${sr},${sg},${sb}) should be the mint`).toBeGreaterThan(Math.max(sr, sb));

  // Create a channel from the team sheet.
  await founder.getByRole('button', { name: 'New channel' }).first().click();
  await founder.getByLabel('Name', { exact: true }).fill('Lane Times');
  await expect(founder.getByText('Saved as #lane-times')).toBeVisible();
  await founder.getByRole('button', { name: 'Create channel' }).click();
  await expect(founder.getByRole('heading', { level: 1 })).toHaveText('lane-times');

  // Make an invite link.
  await founder.getByRole('button', { name: 'Invite people' }).first().click();
  await founder.getByRole('button', { name: 'Make invite link' }).click();
  const link = await founder.getByRole('textbox', { name: 'Invite link' }).inputValue();
  expect(link).toMatch(/\/join\/[2-9a-zA-Z]{10}$/);

  // Guest: opens the link signed out, sees the nook, signs up, comes back, joins.
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(new URL(link).pathname);
  await expect(guest.getByRole('heading', { level: 1 })).toHaveText(`Join ${nookName}`);
  await expect(guest.getByText(`${founderName} invited you`)).toBeVisible();
  await guest.getByRole('link', { name: 'Create an account to join' }).click();
  await signUpViaUi(guest, `Kai Guest ${run}`, `kai-${run}@example.test`);
  await expect(guest).toHaveURL(new RegExp(`${new URL(link).pathname}$`));
  await guest.getByRole('button', { name: `Join ${nookName}` }).click();
  await expect(guest.getByRole('heading', { level: 1 })).toHaveText('general');
  // Everyone in the nook, from the end of the who's-here strip.
  await guest.getByRole('button', { name: /^Everyone in/ }).click();
  await expect(guest.getByRole('complementary', { name: /Members/ })).toContainText(founderName);
  await guest.keyboard.press('Escape');

  // Guest messages the founder.
  await guest.getByRole('button', { name: 'Message someone' }).first().click();
  await guest.getByPlaceholder('Name or handle').fill('Rosa');
  await guest.getByRole('option', { name: new RegExp(founderName) }).click();
  await expect(guest.getByRole('heading', { level: 1, name: founderName })).toBeVisible();
  await expect(guest.getByText(`This is the start of your conversation with Rosa.`)).toBeVisible();
});
