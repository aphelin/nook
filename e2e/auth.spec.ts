import { expect, test } from '@playwright/test';

const run = Date.now().toString(36);
const user = {
  displayName: `Mara Okafor ${run}`,
  email: `mara-${run}@example.test`,
  password: 'correct horse battery',
};

test('sign up, stay signed in across reloads, sign out, sign back in', async ({ page }) => {
  // Signed-out visitors can't reach the app.
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);

  // Sign up: the member card fills in live and the handle is suggested from the name.
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByLabel('Display name').fill(user.displayName);
  await expect(page.getByLabel('Handle')).toHaveValue(`mara_okafor_${run}`.slice(0, 24));
  await expect(page.getByRole('figure')).toContainText(user.displayName); // uppercase is CSS only
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Join Nook' }).click();

  // A brand-new member has no nooks yet, so /app greets them by name.
  const home = page.getByRole('heading', { name: /not in a nook yet/i });
  await expect(page).toHaveURL(/\/app$/);
  await expect(home).toContainText(`Welcome, Mara`);

  // The access token lives in memory only; a reload restores the session via the refresh cookie.
  await page.reload();
  await expect(home).toContainText(`Welcome, Mara`);
  const cookies = await page.context().cookies();
  const refresh = cookies.find((c) => c.name === 'nook_rt');
  expect(refresh?.httpOnly).toBe(true);
  expect(refresh?.path).toBe('/api/auth');

  // Sign out clears the session and protects the app again.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);

  // Wrong password shows a clear error; the right one gets back in and honours ?next.
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('not my password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'match' })).toHaveText('That email and password don’t match.');

  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(home).toContainText(`Welcome, Mara`);
});

test('signup shows field errors from the server and the client', async ({ page }) => {
  await page.goto('/signup');
  await page.getByRole('button', { name: 'Join Nook' }).click();
  await expect(page.getByText('Tell your clubs what to call you.')).toBeVisible();

  // A taken email comes back from the API as a 409 and lands on the email field.
  const taken = { name: `Taken ${run}`, email: `taken-${run}@example.test` };
  const res = await page.request.post('/api/auth/register', {
    data: { email: taken.email, handle: `taken_${run}`.slice(0, 24), displayName: taken.name, password: 'correct horse battery' },
  });
  expect(res.status()).toBe(201);
  await page.context().clearCookies();
  await page.goto('/signup');
  await page.getByLabel('Display name').fill(`Someone ${run}`);
  await page.getByLabel('Email').fill(taken.email);
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByRole('button', { name: 'Join Nook' }).click();
  await expect(page.getByText('An account with that email already exists. Sign in instead.')).toBeVisible();
});
