import { expect, Page } from '@playwright/test';

const LOGIN_BUTTON_NAME = /Logga in|Sign in/i;
const LOGIN_PATH_RE = /\/login(?:\?|$)/;
const DEBUG_AUTH_HELPER = process.env.DEBUG_E2E_AUTH_HELPER === '1';

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

  const emailVisible = await emailInput.isVisible({ timeout }).catch(() => false);
  if (!emailVisible) {
    return false;
  }

  const passwordVisible = await passwordInput.isVisible({ timeout }).catch(() => false);
  const buttonVisible = await loginButton.isVisible({ timeout }).catch(() => false);
  return passwordVisible && buttonVisible;
}

async function waitForLoginOrAuthenticated(page: Page, timeout = 60_000) {
  const startedAt = Date.now();
  let iteration = 0;
  while (Date.now() - startedAt < timeout) {
    iteration += 1;
    if (DEBUG_AUTH_HELPER && iteration % 3 === 1) {
      const bodySnippet = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
      // eslint-disable-next-line no-console
      console.log('[e2e-auth] wait loop', {
        iteration,
        elapsedMs: Date.now() - startedAt,
        url: page.url(),
        bodySnippet,
      });
    }

    if (await waitForAuthenticatedShell(page, 1_500).catch(() => false)) {
      return 'authenticated' as const;
    }

    if (await waitForLoginForm(page, 1_500)) {
      return 'login' as const;
    }

    const currentPath = (() => {
      try {
        return new URL(page.url()).pathname;
      } catch {
        return '';
      }
    })();
    if (currentPath.startsWith('/field')) {
      return 'authenticated_non_admin' as const;
    }

    await page.waitForTimeout(1_000);
  }

  return 'timeout' as const;
}

async function resetBrowserAuthState(page: Page) {
  if (page.isClosed()) return;
  await page.context().clearCookies();
  await page.goto('/login');
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
    } catch {
      // ignore storage access errors
    }
    try {
      window.sessionStorage.clear();
    } catch {
      // ignore storage access errors
    }
  });
  await page.goto('/login');
}

async function safeGotoLogin(page: Page) {
  if (page.isClosed()) {
    throw new Error('Browser page was closed while auth helper was running.');
  }
  await page.goto('/login');
}

export async function ensureAuthenticated(page: Page) {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Login is required for this test run. Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD for real-auth smoke tests.',
    );
  }

  if (DEBUG_AUTH_HELPER) {
    const debugPage = page as Page & { __authDebugAttached?: boolean };
    if (!debugPage.__authDebugAttached) {
      page.on('console', (msg) => {
        // eslint-disable-next-line no-console
        console.log('[e2e-auth][console]', msg.type(), msg.text());
      });
      page.on('pageerror', (error) => {
        // eslint-disable-next-line no-console
        console.log('[e2e-auth][pageerror]', error.message);
      });
      page.on('requestfailed', (request) => {
        // eslint-disable-next-line no-console
        console.log('[e2e-auth][requestfailed]', request.method(), request.url(), request.failure()?.errorText ?? 'unknown');
      });
      debugPage.__authDebugAttached = true;
    }

    // eslint-disable-next-line no-console
    console.log('[e2e-auth] ensureAuthenticated.start', { url: page.url() });
  }

  if (!LOGIN_PATH_RE.test(page.url()) && (await waitForAuthenticatedShell(page, 12_000))) {
    return;
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (page.isClosed()) {
      throw new Error('Browser page was closed before authentication could complete.');
    }

    const onLoginPage = LOGIN_PATH_RE.test(page.url());
    if (!onLoginPage) {
      await safeGotoLogin(page);
    }

    const firstState = await waitForLoginOrAuthenticated(page, 30_000);
    if (DEBUG_AUTH_HELPER) {
      // eslint-disable-next-line no-console
      console.log('[e2e-auth] firstState', { attempt, firstState, url: page.url() });
    }
    if (firstState === 'authenticated') {
      return;
    }
    if (firstState === 'authenticated_non_admin') {
      throw new Error('Authenticated as non-admin user (redirected to /field). Set E2E admin credentials.');
    }

    if (firstState !== 'login') {
      await resetBrowserAuthState(page);
    }

    const secondState = await waitForLoginOrAuthenticated(page, 60_000);
    if (DEBUG_AUTH_HELPER) {
      // eslint-disable-next-line no-console
      console.log('[e2e-auth] secondState', { attempt, secondState, url: page.url() });
    }
    if (secondState === 'authenticated') {
      return;
    }
    if (secondState === 'authenticated_non_admin') {
      throw new Error('Authenticated as non-admin user (redirected to /field). Set E2E admin credentials.');
    }

    if (secondState !== 'login') {
      const bodySnapshot = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 240);
      throw new Error(`Login form was not visible after session reset. Current URL: ${page.url()} | body: ${bodySnapshot}`);
    }

    const loginButton = page.getByRole('button', { name: LOGIN_BUTTON_NAME });
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await loginButton.click({ timeout: 10_000 });

    const postLoginState = await waitForLoginOrAuthenticated(page, 60_000);
    if (DEBUG_AUTH_HELPER) {
      // eslint-disable-next-line no-console
      console.log('[e2e-auth] postLoginState', { attempt, postLoginState, url: page.url() });
    }
    if (postLoginState === 'authenticated') {
      await expect(loginButton).toHaveCount(0, { timeout: 20_000 });
      return;
    }
    if (postLoginState === 'authenticated_non_admin') {
      throw new Error('Authenticated as non-admin user (redirected to /field). Set E2E admin credentials.');
    }

    if (postLoginState === 'login') {
      const loginError = await page.locator('.text-red-700').first().innerText().catch(() => '');
      if (loginError.trim().length > 0) {
        throw new Error(`Login failed: ${loginError.trim()}`);
      }
    }

    // Recover from stuck "Loggar in..." state before retry.
    await safeGotoLogin(page);
  }

  const errorPanel = page.locator('.text-red-700').first();
  const visibleError = (await errorPanel.isVisible().catch(() => false)) ? await errorPanel.innerText() : null;
  throw new Error(
    `Authentication did not stabilize after retries. Current URL: ${page.url()}${visibleError ? ` | UI error: ${visibleError}` : ''}`,
  );
}
