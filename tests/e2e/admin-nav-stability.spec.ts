import { expect, test } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';

test.setTimeout(180_000);

test('admin sidebar keeps billing nav visible across refresh cycles', async ({ page }) => {
  await page.goto('/admin/dashboard');
  await ensureAuthenticated(page);

  const loginButton = page.getByRole('button', { name: /Logga in|Sign in/i });

  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await expect(page.getByTestId('nav-billing')).toBeVisible();

  for (let i = 0; i < 10; i += 1) {
    await page.reload();
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.getByTestId('nav-billing')).toBeVisible();
    await expect(loginButton).toHaveCount(0);
  }
});
