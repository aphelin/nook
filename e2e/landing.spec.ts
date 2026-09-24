import { expect, type Page, test } from '@playwright/test';

const hero = (p: Page) => p.getByRole('region', { name: /^Chat in the colours of Tuesday Climbers\.$/ });
const liveMessages = (p: Page) => p.getByRole('list', { name: /^Messages in #/ }).getByRole('listitem');

/** The club colour the first screen is drenched in. */
async function accent(p: Page) {
  const css = await p.locator('section[aria-labelledby="landing-heading"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  const [r, g, b] = css.match(/\d+/g)!.map(Number) as [number, number, number];
  return { css, r, g, b };
}

test('picking a club re-tints the first screen and the live app inside it', async ({ page }) => {
  await page.goto('/');
  await expect(hero(page)).toBeVisible();
  const rack = page.getByRole('group', { name: 'Try another club' });
  await expect(rack.getByRole('button', { name: 'Tuesday Climbers' })).toHaveAttribute('aria-pressed', 'true');

  // Tuesday Climbers' room is an orange.
  const climbers = await accent(page);
  expect(climbers.r, `Tuesday Climbers' room ${climbers.css} should be orange`).toBeGreaterThan(climbers.b + 80);
  // The change travels as a transition rather than a cut.
  expect(
    await page.locator('section[aria-labelledby="landing-heading"]').evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toContain('0.36s');

  await rack.getByRole('button', { name: 'Dog-Eared' }).click();
  await expect(rack.getByRole('button', { name: 'Dog-Eared' })).toHaveAttribute('aria-pressed', 'true');

  // Dog-Eared's room is a gold. The change is a transition, so wait for where it lands rather than
  // sampling a frame on the way there.
  await expect
    .poll(async () => {
      const { r, g, b } = await accent(page);
      return g > b + 60 && Math.abs(r - g) < 70;
    }, { timeout: 5000, message: "Dog-Eared's room should settle on a gold" })
    .toBe(true);

  // The live nook changed clubs with it.
  await expect(page.getByRole('figure', { name: /Dog-Eared chatting in #now-reading/ })).toBeVisible();
});

test('the live demo shows who reacted, not just how many', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Pause demo' }).click();
  // Every reaction chip in the demo carries at least one face, which is the signature it exists
  // to show off. A chip with a bare number would mean the landing stopped matching the app.
  const chips = page.getByRole('list', { name: /^Messages in #/ }).locator('p.relative > span');
  await expect(chips.first()).toBeVisible();
  const withFaces = await chips.evaluateAll((els) => els.filter((el) => el.querySelectorAll('svg').length > 0).length);
  expect(withFaces).toBe(await chips.count());
});

test('the live demo can be paused and resumed', async ({ page }) => {
  await page.goto('/');
  const before = await liveMessages(page).count();
  await expect.poll(() => liveMessages(page).count(), { timeout: 8000 }).toBeGreaterThan(before);
  await page.getByRole('button', { name: 'Pause demo' }).click();
  const paused = await liveMessages(page).count();
  await page.waitForTimeout(3500);
  expect(await liveMessages(page).count()).toBe(paused);
  await page.getByRole('button', { name: 'Play demo' }).click();
  await expect.poll(() => liveMessages(page).count(), { timeout: 8000 }).not.toBe(paused);
});

test('Try the demo signs in as the demo member and lands in Tuesday Climbers; then the page offers Open Nook', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page).toHaveURL(/\/app\/tuesday-climbers\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Account: Mara Okafor' })).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Nook' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Account' }).getByRole('link', { name: 'Open Nook' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(1); // only the footer's
});

test('the status page reports the api that answered', async ({ page }) => {
  await page.goto('/status');
  await expect(page.getByTestId('api-status')).toHaveText(/^ok · /);
});
