import { expect, test } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';

test.setTimeout(180_000);

test('admin billing route remains stable across refreshes', async ({ page }) => {
  await page.goto('/admin/billing?tab=ready');
  await ensureAuthenticated(page);

  const loginButton = page.getByRole('button', { name: /Logga in|Sign in/i });
  const billingNav = page.getByTestId('nav-billing');

  // Some auth flows land on dashboard first; force navigation to billing before assertions.
  if (!/\/admin\/billing/.test(page.url())) {
    await billingNav.click();
  }

  await expect(page).toHaveURL(/\/admin\/billing/);
  await expect(page.getByRole('heading', { name: /Faktureringskö|Billing Queue/i })).toBeVisible();
  await expect(billingNav).toBeVisible();

  for (let i = 0; i < 10; i += 1) {
    await page.reload();
    await expect(page).toHaveURL(/\/admin\/billing/);
    await expect(page.getByRole('heading', { name: /Faktureringskö|Billing Queue/i })).toBeVisible();
    await expect(billingNav).toBeVisible();
    await expect(loginButton).toHaveCount(0);
  }
});
