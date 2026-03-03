import { expect, Page } from '@playwright/test';

const LOGIN_BUTTON_NAME = /Logga in|Sign in/i;
const LOGIN_BUSY_BUTTON_NAME = /Loggar in|Signing in/i;
const LOGIN_PATH_RE = /\/login(?:\?|$)/;
const DEBUG_AUTH_HELPER = process.env.DEBUG_E2E_AUTH_HELPER === '1';

interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

interface EnsureAuthenticatedOptions {
  email?: string;
  password?: string;
}

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

async function readSessionTokens(page: Page): Promise<SessionTokens | null> {
  return page.evaluate(() => {
    type SessionCandidate = {
      access_token?: unknown;
      refresh_token?: unknown;
      currentSession?: SessionCandidate;
      session?: SessionCandidate;
    };

    const rawValues: string[] = [];
    const collect = (storage: Storage | null) => {
      if (!storage) return;
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key) continue;
        const isLegacyKey = /^sb-.*-auth-token$/.test(key);
        const isFlowlyKey = key.startsWith('flowly-auth');
        if (!isLegacyKey && !isFlowlyKey) continue;
        const value = storage.getItem(key);
        if (typeof value === 'string' && value.trim().length > 0) {
          rawValues.push(value);
        }
      }
    };

    collect(window.localStorage);
    try {
      collect(window.sessionStorage);
    } catch {
      // ignore sessionStorage access errors
    }

    const resolveTokens = (candidate: SessionCandidate | null | undefined) => {
      if (!candidate) return null;
      if (typeof candidate.access_token === 'string' && typeof candidate.refresh_token === 'string') {
        return { accessToken: candidate.access_token, refreshToken: candidate.refresh_token };
      }
      return null;
    };

    for (const raw of rawValues) {
      try {
        const parsed = JSON.parse(raw) as SessionCandidate;
        const direct = resolveTokens(parsed);
        if (direct) return direct;
        const currentSession = resolveTokens(parsed.currentSession);
        if (currentSession) return currentSession;
        const nestedSession = resolveTokens(parsed.session);
        if (nestedSession) return nestedSession;
      } catch {
        // ignore malformed storage blobs
      }
    }

    return null;
  });
}

function functionUrl(functionName: string) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim() || '';
  if (!supabaseUrl) return '';
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${functionName}`;
}

async function tryRecoverAdminOrganization(page: Page): Promise<boolean> {
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim() || '';
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim() || '';
  if (!anonKey || !supabaseUrl) {
    return false;
  }

  const tokens = await readSessionTokens(page);
  if (!tokens) {
    return false;
  }

  const baseUrl = supabaseUrl.replace(/\/$/, '');
  const userRes = await page.request.get(`${baseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${tokens.accessToken}`,
    },
  });
  if (!userRes.ok()) {
    return false;
  }

  const userPayload = (await userRes.json().catch(() => null)) as { id?: string } | null;
  const userId = typeof userPayload?.id === 'string' ? userPayload.id : '';
  if (!userId) {
    return false;
  }

  const profileRes = await page.request.get(
    `${baseUrl}/rest/v1/profiles?select=organization_id,active_organization_id&id=eq.${encodeURIComponent(userId)}`,
    {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${tokens.accessToken}`,
        accept: 'application/json',
      },
    },
  );
  if (!profileRes.ok()) {
    return false;
  }

  const profileRows = (await profileRes.json().catch(() => null)) as Array<{
    organization_id?: string | null;
    active_organization_id?: string | null;
  }> | null;
  const profile = Array.isArray(profileRows) ? profileRows[0] : null;
  const targetOrgId =
    (typeof profile?.organization_id === 'string' && profile.organization_id.trim().length > 0
      ? profile.organization_id
      : null) ??
    (typeof profile?.active_organization_id === 'string' && profile.active_organization_id.trim().length > 0
      ? profile.active_organization_id
      : null);
  if (!targetOrgId) {
    return false;
  }

  const switchRes = await page.request.post(functionUrl('switch-active-organization'), {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${tokens.accessToken}`,
      'content-type': 'application/json',
    },
    data: {
      organization_id: targetOrgId,
    },
  });
  if (!switchRes.ok()) {
    return false;
  }

  await page.goto('/admin/dashboard');
  return waitForAuthenticatedShell(page, 10_000).catch(() => false);
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
  let loginVisibleSince: number | null = null;
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

    const loginVisible = await waitForLoginForm(page, 1_500);
    if (loginVisible) {
      if (loginVisibleSince === null) {
        loginVisibleSince = Date.now();
      }

      const loginSubmitButton = page.locator('button[type="submit"]').first();
      const submitDisabled = await loginSubmitButton.isDisabled().catch(() => false);
      const busyButtonVisible = await page.getByRole('button', { name: LOGIN_BUSY_BUTTON_NAME }).isVisible({ timeout: 250 }).catch(() => false);
      const loginVisibleMs = Date.now() - loginVisibleSince;

      // Ignore transient login form state immediately after submit while auth redirects.
      if (!submitDisabled && !busyButtonVisible && loginVisibleMs >= 3_000) {
        return 'login' as const;
      }
    } else {
      loginVisibleSince = null;
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

async function readVisibleLoginError(page: Page) {
  const errorPanel = page.locator('.text-red-700').first();
  const visible = await errorPanel.isVisible({ timeout: 750 }).catch(() => false);
  if (!visible) {
    return '';
  }

  return (await errorPanel.innerText({ timeout: 2_000 }).catch(() => '')).trim();
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

export async function ensureAuthenticated(page: Page, options: EnsureAuthenticatedOptions = {}) {
  const email = options.email?.trim() || process.env.E2E_ADMIN_EMAIL?.trim() || '';
  const password = options.password?.trim() || process.env.E2E_ADMIN_PASSWORD?.trim() || '';

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

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (page.isClosed()) {
      throw new Error('Browser page was closed before authentication could complete.');
    }

    const onLoginPage = LOGIN_PATH_RE.test(page.url());
    if (!onLoginPage) {
      await safeGotoLogin(page);
    }

    const firstState = await waitForLoginOrAuthenticated(page, 12_000);
    if (DEBUG_AUTH_HELPER) {
      // eslint-disable-next-line no-console
      console.log('[e2e-auth] firstState', { attempt, firstState, url: page.url() });
    }
    if (firstState === 'authenticated') {
      return;
    }
    if (firstState === 'authenticated_non_admin') {
      const recovered = await tryRecoverAdminOrganization(page);
      if (recovered) {
        return;
      }
      throw new Error('Authenticated as non-admin user (redirected to /field). Set E2E admin credentials.');
    }

    if (firstState !== 'login') {
      await resetBrowserAuthState(page);
    }

    const secondState = await waitForLoginOrAuthenticated(page, 18_000);
    if (DEBUG_AUTH_HELPER) {
      // eslint-disable-next-line no-console
      console.log('[e2e-auth] secondState', { attempt, secondState, url: page.url() });
    }
    if (secondState === 'authenticated') {
      return;
    }
    if (secondState === 'authenticated_non_admin') {
      const recovered = await tryRecoverAdminOrganization(page);
      if (recovered) {
        return;
      }
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

    const postLoginState = await waitForLoginOrAuthenticated(page, 18_000);
    if (DEBUG_AUTH_HELPER) {
      // eslint-disable-next-line no-console
      console.log('[e2e-auth] postLoginState', { attempt, postLoginState, url: page.url() });
    }
    if (postLoginState === 'authenticated') {
      await expect(loginButton).toHaveCount(0, { timeout: 20_000 });
      return;
    }
    if (postLoginState === 'authenticated_non_admin') {
      const recovered = await tryRecoverAdminOrganization(page);
      if (recovered) {
        return;
      }
      throw new Error('Authenticated as non-admin user (redirected to /field). Set E2E admin credentials.');
    }

    if (postLoginState === 'login') {
      const loginError = await readVisibleLoginError(page);
      if (loginError.length > 0) {
        throw new Error(`Login failed: ${loginError}`);
      }
    }

    // Recover from stuck "Loggar in..." state before retry.
    await safeGotoLogin(page);
  }

  const visibleError = await readVisibleLoginError(page);
  throw new Error(
    `Authentication did not stabilize after retries. Current URL: ${page.url()}${visibleError.length > 0 ? ` | UI error: ${visibleError}` : ''}`,
  );
}
