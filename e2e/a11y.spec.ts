import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const run = Date.now().toString(36);

/** WCAG 2.2 A and AA rules; anything serious or critical fails the page. */
async function audit(page: Page, where: string) {
  // Popups fade in and out; judge colours once nothing is mid-transition.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const report = blocking.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join('\n    ')}`).join('\n  ');
  expect(blocking, `${where}\n  ${report}`).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`no serious accessibility violations across the app (${scheme})`, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, reducedMotion: 'reduce' });
    const page = await context.newPage();

    // The landing page in every club's kit (paused, so nothing arrives mid-audit).
    await page.goto('/');
    await page.getByRole('button', { name: 'Pause demo' }).click();
    await audit(page, 'landing: Tuesday Climbers');
    for (const club of ['Dog-Eared', 'Patch Bay', 'Harbour Rowing']) {
      await page.getByRole('group', { name: 'Try another club' }).getByRole('button', { name: club }).click();
      await expect(page.getByRole('button', { name: club })).toHaveAttribute('aria-pressed', 'true');
      await audit(page, `landing: ${club}`);
    }

    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await audit(page, 'sign in');
    await page.goto('/signup');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await audit(page, 'sign up');

    // Two people and a nook with a thread, so every surface has real content.
    const handle = `a11y${scheme[0]}_${run}`.slice(0, 24);
    const res = await page.request.post('/api/auth/register', {
      data: { email: `${handle}@example.test`, handle, displayName: `Robin ${scheme}`, password: 'correct horse battery' },
    });
    expect(res.status()).toBe(201);
    const token = (await res.json()).accessToken as string;
    const auth = { Authorization: `Bearer ${token}` };
    const slug = `a11y-${scheme}-${run}`.slice(0, 32);
    const created = await page.request.post('/api/nooks', { headers: auth, data: { name: 'Access Club', slug, kit: { field: '#7a1f2b', mark: '#e8c872' } } });
    const general = ((await created.json()).channels as { id: string; name: string }[]).find((c) => c.name === 'general')!.id;
    const code = (await (await page.request.post(`/api/nooks/${slug}/invites`, { headers: auth, data: {} })).json()).code as string;

    await page.goto(`/join/${code}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await audit(page, 'join');

    await page.goto(`/app/${slug}/${general}`);
    const box = page.getByRole('textbox', { name: 'Message #general' });
    await box.fill(`Welcome to the club, **everyone**. Check \`the rota\` and https://example.com`);
    await box.press('Enter');
    const row = page.getByTestId('virtuoso-item-list').getByRole('article').first();
    await expect(row).toBeVisible();
    await audit(page, 'shell');

    await row.hover();
    await row.getByRole('button', { name: 'Reply in thread' }).click();
    await page.getByRole('textbox', { name: 'Reply…' }).fill('A reply');
    await page.getByRole('textbox', { name: 'Reply…' }).press('Enter');
    await expect(page.getByRole('complementary', { name: 'Thread' })).toContainText('A reply');
    await audit(page, 'thread');
    await page.getByRole('button', { name: 'Close thread' }).click();

    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: 'Jump to, search or run a command' }).pressSequentially('welcome');
    await expect(page.getByRole('option').first()).toBeVisible();
    await audit(page, 'command palette');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /^Inbox/ }).click();
    await expect(page.getByText('All caught up')).toBeVisible();
    await audit(page, 'inbox');
    await page.keyboard.press('Escape');

    await page.getByRole('list', { name: "Who's here" }).getByRole('button', { name: /view profile/ }).first().click();
    await expect(page.getByRole('button', { name: 'Edit profile' })).toBeVisible();
    await audit(page, 'person card');
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit profile' })).toBeVisible();
    await audit(page, 'profile dialog');
    await page.keyboard.press('Escape');

    await page.goto('/no/such/place');
    await expect(page.getByRole('heading', { name: 'Nothing at this address' })).toBeVisible();
    await audit(page, 'not found');
    await context.close();
  });
}
