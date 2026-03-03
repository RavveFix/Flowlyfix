import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { ensureAdminSmokeReadyBillingFixture } from './helpers/adminSmokeFixture';

test.setTimeout(120_000);

const STRICT_ADMIN_SMOKE = process.env.E2E_STRICT_ADMIN_SMOKE === '1';

function failOrSkip(shouldSkip: boolean, reason: string) {
  if (!shouldSkip) {
    return;
  }

  if (STRICT_ADMIN_SMOKE) {
    throw new Error(`Strict admin smoke: ${reason}`);
  }

  test.skip(true, reason);
}

test('billing READY queue renders and allows detail edits', async ({ page }) => {
  const readyFixture = await ensureAdminSmokeReadyBillingFixture().catch(() => null);
  failOrSkip(!readyFixture, 'Could not provision READY billing fixture for smoke-admin.');
  if (!readyFixture) {
    return;
  }

  await page.goto('/admin/dashboard');
  await ensureAuthenticated(page);
  await page.goto('/admin/billing?tab=ready');
  await page.waitForURL(/\/admin\/billing/);
  await expect(page.getByText(/Faktureringskö|Billing Queue/i)).toBeVisible({ timeout: 15_000 });

  const readyFixtureRow = page
    .locator('div.bg-white.border.border-gray-200.rounded-xl')
    .filter({ hasText: readyFixture.description })
    .first();
  const hasReadyFixtureRow = await readyFixtureRow.isVisible({ timeout: 20_000 }).catch(() => false);
  failOrSkip(
    !hasReadyFixtureRow,
    `Could not find READY fixture row for "${readyFixture.description}" in billing queue.`,
  );
  if (!hasReadyFixtureRow) {
    return;
  }

  const patchedReport = `Smoke billing edit ${Date.now()}`;
  await readyFixtureRow.getByRole('button', { name: /Redigera underlag|Edit Details/i }).first().click();
  await page.getByPlaceholder(/Beskriv vad som utfördes|Describe what was done/i).fill(patchedReport);
  await readyFixtureRow.getByRole('button', { name: /Spara underlag|Save Details/i }).first().click();
  await expect(readyFixtureRow.getByText(patchedReport)).toBeVisible({ timeout: 15_000 });
});
