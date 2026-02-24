import { expect, Page } from '@playwright/test';

const LOGIN_BUTTON_NAME = /Logga in|Sign in/i;
const LOGIN_PATH_RE = /\/login(?:\?|$)/;

async function waitForAuthenticatedShell(page: Page, timeout = 10_000) {
  const navDashboard = page.getByTestId('nav-dashboard');
  const navBilling = page.getByTestId('nav-billing');

  const dashboardVisible = await navDashboard.isVisible({ timeout }).catch(() => false);
  if (!dashboardVisible) {
    return false;
  }

  // Admin users should always expose billing in sidebar.
  await expect(navBilling).toBeVisible({ timeout });
  return true;
}

async function waitForLoginForm(page: Page, timeout = 20_000) {
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  const loginButton = page.getByRole('button', { name: LOGIN_BUTTON_NAME });

  await expect(emailInput).toBeVisible({ timeout });
  await expect(passwordInput).toBeVisible({ timeout });
  await expect(loginButton).toBeVisible({ timeout });
}

export async function ensureAuthenticated(page: Page) {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Login is required for this test run. Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD for real-auth smoke tests.',
    );
  }

  if (await waitForAuthenticatedShell(page, 12_000)) {
    return;
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const onLoginPage = LOGIN_PATH_RE.test(page.url());
    if (!onLoginPage) {
      await page.goto('/login');
    }

    await waitForLoginForm(page, 20_000);

    const loginButton = page.getByRole('button', { name: LOGIN_BUTTON_NAME });
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await loginButton.click({ timeout: 10_000 });

    const authenticated = await waitForAuthenticatedShell(page, 20_000).catch(() => false);
    if (authenticated) {
      await expect(loginButton).toHaveCount(0, { timeout: 20_000 });
      return;
    }

    // Recover from stuck "Loggar in..." state before retry.
    await page.goto('/login');
  }

  const errorPanel = page.locator('.text-red-700').first();
  const visibleError = (await errorPanel.isVisible().catch(() => false)) ? await errorPanel.innerText() : null;
  throw new Error(
    `Authentication did not stabilize after retries. Current URL: ${page.url()}${visibleError ? ` | UI error: ${visibleError}` : ''}`,
  );
}
