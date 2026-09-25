import { expect, type Page, test } from '@playwright/test';

const run = Date.now().toString(36);

async function twoNooks(page: Page, tag: string) {
  const handle = `${tag}_${run}`.slice(0, 24);
  const res = await page.request.post('/api/auth/register', {
    data: { email: `${handle}@example.test`, handle, displayName: `Kit ${tag}`, password: 'correct horse battery' },
  });
  expect(res.status()).toBe(201);
  const auth = { Authorization: `Bearer ${(await res.json()).accessToken as string}` };
  const make = async (name: string, field: string, mark: string) => {
    const slug = `${name.toLowerCase()}-${tag}-${run}`.slice(0, 32);
    const created = await page.request.post('/api/nooks', { headers: auth, data: { name, slug, kit: { field, mark } } });
    expect(created.status()).toBe(201);
    return { slug, name, general: ((await created.json()).channels as { id: string; name: string }[]).find((c) => c.name === 'general')!.id };
  };
  // Harbour is navy and orange, Ember burgundy and gold. The whole screen — the deep colour the rail
  // is drenched in and the bright colour the room is drenched in — follows whichever nook you are in.
  return { first: await make('Harbour', '#1f4e79', '#f28c28'), second: await make('Ember', '#7a1f2b', '#e8c872') };
}

const rgb = (css: string) => {
  const [r, g, b] = css.match(/\d+/g)!.map(Number) as [number, number, number];
  return { css, r, g, b };
};

/** The club's deep colour, read off the rail. */
async function deep(page: Page) {
  return rgb(await page.getByRole('navigation', { name: 'Nooks' }).evaluate((el) => getComputedStyle(el).backgroundColor));
}

/** The club's bright colour, read off the room it drenches (by day). */
async function room(page: Page) {
  return rgb(await page.getByTestId('shell').evaluate((el) => getComputedStyle(el).backgroundColor));
}

test('the screen takes the colours of the nook you are in, and re-tints when you switch', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })).newPage();
  const { first, second } = await twoNooks(page, 'tint');
  await page.goto(`/app/${first.slug}/${first.general}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('general');

  // Harbour's deep colour is navy (the rail leans blue) and its bright one orange (the room leans red).
  const harbour = await deep(page);
  expect(harbour.b, `Harbour's deep colour ${harbour.css} should lean blue`).toBeGreaterThan(harbour.r);
  const orange = await room(page);
  expect(orange.r, `Harbour's room ${orange.css} should be orange`).toBeGreaterThan(orange.b + 80);

  // The re-tint is a transition, not a cut: the colours travel rather than jump (a story turn switches it off while it runs).
  const duration = await page.getByTestId('shell').evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(duration).toContain('0.36s');

  await page.getByRole('navigation', { name: 'Nooks' }).getByRole('link', { name: new RegExp(`^${second.name}`) }).click();
  await expect(page).toHaveURL(new RegExp(second.slug));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('general');

  // Ember is wine and gold. Same elements, same page, different colours — waited for where the
  // transition lands, not sampled on the way there.
  await expect
    .poll(async () => {
      const { r, b } = await deep(page);
      return r > b + 15;
    }, { timeout: 5000, message: "Ember's rail should settle on a wine" })
    .toBe(true);
  await expect
    .poll(async () => {
      const { r, g, b } = await room(page);
      return g > b + 60 && Math.abs(r - g) < 70;
    }, { timeout: 5000, message: "Ember's room should settle on a gold" })
    .toBe(true);
});

test('under reduced motion the accent changes without a transition', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })).newPage();
  const { first, second } = await twoNooks(page, 'still');
  await page.goto(`/app/${first.slug}/${first.general}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('general');
  const send = page.getByRole('button', { name: /^Send message|^Uploading, send when done/ });
  const before = await send.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await send.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');

  await page.getByRole('navigation', { name: 'Nooks' }).getByRole('link', { name: new RegExp(`^${second.name}`) }).click();
  await expect(page).toHaveURL(new RegExp(second.slug));
  await expect.poll(() => send.evaluate((el) => getComputedStyle(el).backgroundColor), { timeout: 5000 }).not.toBe(before);
});

test('a reaction chip carries the faces of the people who reacted', async ({ browser }) => {
  const one = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const { first } = await twoNooks(one, 'react');
  await one.goto(`/app/${first.slug}/${first.general}`);
  const box = one.getByRole('textbox', { name: 'Message #general' });
  await box.fill('Worth reacting to');
  await box.press('Enter');

  const row = one.getByTestId('virtuoso-item-list').getByRole('article').filter({ hasText: 'Worth reacting to' });
  await expect(row).toBeVisible();
  await row.hover();
  await row.getByRole('button', { name: 'Add a reaction' }).click();
  await one.getByRole('searchbox', { name: 'Search emoji' }).fill('thumbs up');
  await one.getByRole('gridcell', { name: 'Thumbs up', exact: true }).click();

  // The chip names who reacted for assistive tech, and shows their face for everyone else.
  const chip = row.getByRole('button', { name: /^👍️? 1:/u });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(chip.locator('svg')).toHaveCount(1);

  // The chips sit right under the words they react to, inside the same message.
  const gap = await row.evaluate((article) => {
    const words = [...article.querySelectorAll<HTMLElement>('div')].find((el) => el.textContent === 'Worth reacting to');
    const chips = article.querySelector<HTMLElement>('ul[aria-label="Reactions"]');
    if (!words || !chips) return null;
    return chips.getBoundingClientRect().top - words.getBoundingClientRect().bottom;
  });
  expect(gap, 'the reaction chips must sit just under the message they belong to').not.toBeNull();
  expect(gap!).toBeGreaterThanOrEqual(0);
  expect(gap!).toBeLessThan(16);
});

test('an unknown address gets the not-found page with a way back', async ({ page }) => {
  const res = await page.goto('/no/such/place');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Nothing at this address' })).toBeVisible();
  await page.getByRole('link', { name: 'Nook home' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('keyboard users can skip straight to the conversation', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const { first } = await twoNooks(page, 'skip');
  await page.goto(`/app/${first.slug}/${first.general}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('general');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to conversation' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#conversation')).toBeFocused();
  // The next Tab lands inside the conversation, not back in the rail.
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('main'))).toBe(true);
});

test('switching nooks never paints a channel as empty before its messages', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const { first, second } = await twoNooks(page, 'paint');
  await page.goto(`/app/${second.slug}/${second.general}`);
  const composer = page.getByRole('textbox', { name: 'Message #general' });
  await composer.fill('Something to read when you come back');
  await composer.press('Enter');
  await expect(page.getByText('Something to read when you come back')).toBeVisible();
  // The nook we switch from has a message too, so an intro with no rows is only ever the bug.
  const rail = page.getByRole('navigation', { name: 'Nooks' });
  await rail.getByRole('link', { name: new RegExp(`^${first.name}`) }).click();
  await expect(page).toHaveURL(new RegExp(first.slug));
  await composer.fill('Meanwhile, in the other nook');
  await composer.press('Enter');
  await expect(page.getByText('Meanwhile, in the other nook')).toBeVisible();

  // Every frame from the click on: the channel's "very start" intro must never show without the
  // message under it (the list used to paint its header a few frames before its rows).
  await page.evaluate(() => {
    const w = window as unknown as { emptyFrames: number; frames: number };
    w.emptyFrames = 0;
    w.frames = 0;
    const tick = () => {
      w.frames++;
      const intro = [...document.querySelectorAll('main h2')].some(
        (el) => /^The start of #/.test(el.textContent ?? '') && el.checkVisibility({ visibilityProperty: true }),
      );
      if (intro && !document.querySelector('[data-message-id]')) w.emptyFrames++;
      if (w.frames < 90) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await rail.getByRole('link', { name: new RegExp(`^${second.name}`) }).click();
  await expect(page.getByText('Something to read when you come back')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { frames: number }).frames)).toBe(90);
  expect(await page.evaluate(() => (window as unknown as { emptyFrames: number }).emptyFrames)).toBe(0);
});
