import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

test('admin billing route remains stable across refreshes', async ({ page }) => {
  const base = 'http://127.0.0.1:4173';

  await page.goto(`${base}/admin/billing?tab=ready`);

  const loginButton = page.getByRole('button', { name: /Logga in|Sign in/i });
  if (await loginButton.isVisible().catch(() => false)) {
    await page.locator('input[type="email"]').fill('admin@flowly.io');
    await page.locator('input[type="password"]').fill('password123');
    await loginButton.click();
  }

  await expect(page).toHaveURL(/\/admin\/billing/);
  await expect(page.getByRole('heading', { name: /Faktureringskö|Billing Queue/i })).toBeVisible();

  for (let i = 0; i < 3; i += 1) {
    await page.reload();
    await expect(page).toHaveURL(/\/admin\/billing/);
    await expect(page.getByRole('heading', { name: /Faktureringskö|Billing Queue/i })).toBeVisible();
    await expect(loginButton).toHaveCount(0);
  }
});
