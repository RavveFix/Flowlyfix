import { expect, test } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';

test.setTimeout(240_000);

test('admin logout/login cycles keep billing nav stable', async ({ page }) => {
  await page.goto('/admin/dashboard');
  await ensureAuthenticated(page);

  const loginButton = page.getByRole('button', { name: /Logga in|Sign in/i });
  const signOutButton = page.locator('aside button[title="Logga ut"], aside button[title="Sign out"]');

  for (let i = 0; i < 10; i += 1) {
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.getByTestId('nav-billing')).toBeVisible();

    await expect(signOutButton.first()).toBeVisible();
    await signOutButton.first().click();

    await expect(page).toHaveURL(/\/login/);
    await expect(loginButton).toBeVisible();

    await page.goto('/admin/dashboard');
    await ensureAuthenticated(page);

    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.getByTestId('nav-billing')).toBeVisible();
    await expect(loginButton).toHaveCount(0);
  }
});
