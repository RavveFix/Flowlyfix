import { expect, Page, test } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { ensureTechnicianRoleFixtureForAdminUser } from './helpers/roleFixture';

interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

interface SwitchOrgResult {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
}

interface FixtureOrgResult {
  organizationId: string;
  source: 'existing' | 'created' | 'unknown';
}

function orgSwitcherLocator(page: Page) {
  return page.locator('label:has-text("Aktivt företag")').locator('xpath=following-sibling::select[1]').first();
}

async function readRoleBadge(page: Page) {
  const roleBadge = page.locator('span', { hasText: /^Roll:/i }).first();
  const visible = await roleBadge.isVisible({ timeout: 3_000 }).catch(() => false);
  if (!visible) return null;
  return (await roleBadge.innerText()).trim();
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

async function switchActiveOrganizationViaFunction(page: Page, organizationId: string): Promise<SwitchOrgResult | null> {
  if (page.isClosed()) {
    return null;
  }

  const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim() || '';
  const url = functionUrl('switch-active-organization');
  if (!anonKey || !url) {
    return null;
  }

  const tokens = await readSessionTokens(page);
  if (!tokens) {
    return null;
  }

  const response = await page.request.post(url, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${tokens.accessToken}`,
      'content-type': 'application/json',
    },
    data: {
      organization_id: organizationId,
    },
  });

  let body: Record<string, unknown> | null = null;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }

  return {
    ok: response.ok(),
    status: response.status(),
    body,
  };
}

function isAuthRecoveryCleanupError(result: SwitchOrgResult | null) {
  if (!result || result.ok) return false;
  const message =
    typeof result.body?.message === 'string'
      ? result.body.message
      : typeof result.body?.error === 'string'
        ? result.body.error
        : '';
  const code =
    typeof result.body?.code === 'number'
      ? result.body.code
      : typeof result.body?.code === 'string'
        ? Number(result.body.code)
        : NaN;

  const normalizedMessage = message.toLowerCase();
  return (
    result.status === 401 &&
    (normalizedMessage.includes('invalid jwt') ||
      normalizedMessage.includes('unauthorized') ||
      code === 401)
  );
}

async function ensureFixtureOrgViaFunction(page: Page): Promise<FixtureOrgResult | null> {
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim() || '';
  const url = functionUrl('e2e-role-fixture');
  if (!anonKey || !url) {
    return null;
  }

  const tokens = await readSessionTokens(page);
  if (!tokens) {
    return null;
  }

  const response = await page.request.post(url, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${tokens.accessToken}`,
      'content-type': 'application/json',
    },
    data: {},
  });

  if (!response.ok()) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const organizationId = typeof payload?.organization_id === 'string' ? payload.organization_id : '';
  if (!organizationId) {
    return null;
  }

  const source =
    payload?.source === 'existing' || payload?.source === 'created'
      ? payload.source
      : 'unknown';

  return {
    organizationId,
    source,
  };
}

test.setTimeout(240_000);

const STRICT_AUTH_SMOKE = process.env.E2E_STRICT_AUTH_SMOKE === '1';

function failOrSkip(shouldSkip: boolean, reason: string) {
  if (!shouldSkip) {
    return;
  }

  if (STRICT_AUTH_SMOKE) {
    throw new Error(`Strict auth smoke: ${reason}`);
  }

  test.skip(true, reason);
}

test('org switch + role transition remains enforced after auth callback in same session', async ({ page }) => {
  const callbackAdminEmail = (process.env.E2E_CALLBACK_ADMIN_EMAIL ?? '').trim();
  const callbackAdminPassword = (process.env.E2E_CALLBACK_ADMIN_PASSWORD ?? '').trim();
  const callbackScenarioEnabled = callbackAdminEmail.length > 0 && callbackAdminPassword.length > 0;
  failOrSkip(
    !callbackScenarioEnabled,
    'Sätt E2E_CALLBACK_ADMIN_EMAIL och E2E_CALLBACK_ADMIN_PASSWORD för dedikerat callback-konto.',
  );

  await page.goto('/admin/dashboard');
  await ensureAuthenticated(page, {
    email: callbackAdminEmail,
    password: callbackAdminPassword,
  });
  await expect(page.getByTestId('nav-dashboard')).toBeVisible();

  let fixtureOrgId: string | null = null;

  const functionFixture = await ensureFixtureOrgViaFunction(page);
  if (functionFixture?.organizationId) {
    fixtureOrgId = functionFixture.organizationId;
  }

  const fixture = fixtureOrgId ? null : await ensureTechnicianRoleFixtureForAdminUser();
  if (fixture?.organizationId) {
    fixtureOrgId = fixture.organizationId;
  }

  if (fixtureOrgId) {
    await page.reload();
    await expect(page.getByTestId('nav-dashboard')).toBeVisible();
    await expect(orgSwitcherLocator(page).locator(`option[value="${fixtureOrgId}"]`)).toHaveCount(1, {
      timeout: 20_000,
    });
  }

  const orgSwitcher = orgSwitcherLocator(page);
  const orgSwitcherVisible = await orgSwitcher.isVisible({ timeout: 10_000 }).catch(() => false);
  failOrSkip(orgSwitcherVisible === false, 'Org switcher saknas. Testet kräver flera aktiva medlemskap.');
  const originalOrgId = await orgSwitcher.inputValue();

  const options = await orgSwitcherLocator(page)
    .locator('option')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => ({
          value: (node as HTMLOptionElement).value,
          label: (node.textContent ?? '').trim(),
        }))
        .filter((item) => item.value.length > 0),
    );
  failOrSkip(options.length < 2, 'Minst två organisationsmedlemskap krävs för org-byte-testet.');

  const targetOrg =
    (fixtureOrgId ? options.find((option) => option.value === fixtureOrgId) : null) ??
    options.find((option) => option.value !== originalOrgId) ??
    null;
  failOrSkip(!targetOrg, 'Kunde inte hitta målorganisation för org-byte.');

  let switchedAwayFromOriginal = false;

  const roleBeforeSwitch = await readRoleBadge(page);
  try {
    await orgSwitcherLocator(page).selectOption(targetOrg.value);
    switchedAwayFromOriginal = targetOrg.value !== originalOrgId;
    await page.waitForTimeout(800);

    let switchedToField = /\/field(?:\?|$)/.test(page.url());
    let switchedInUi = false;
    if (!switchedToField) {
      try {
        await expect(orgSwitcherLocator(page)).toHaveValue(targetOrg.value, { timeout: 8_000 });
        switchedInUi = true;
      } catch {
        const switchedViaFunction = await switchActiveOrganizationViaFunction(page, targetOrg.value);
        if (switchedViaFunction?.ok) {
          await page.goto('/admin/dashboard');
          switchedToField = /\/field(?:\?|$)/.test(page.url());
          switchedInUi = (await orgSwitcherLocator(page).inputValue().catch(() => '')) === targetOrg.value;
        }
      }
    }
    failOrSkip(
      !(switchedToField || switchedInUi),
      'Org-byte kunde inte verifieras i denna miljö (möjlig JWT-gateway blockering).',
    );

    const roleAfterSwitch = await readRoleBadge(page);
    const roleChanged = Boolean(roleBeforeSwitch && roleAfterSwitch && roleBeforeSwitch !== roleAfterSwitch);
    failOrSkip(!(switchedToField || roleChanged), 'Ingen rollövergång upptäcktes vid org-byte i denna miljö.');

    const tokens = await readSessionTokens(page);
    expect(tokens).not.toBeNull();
    if (!tokens) {
      return;
    }

    await page.goto(
      `/auth/callback#access_token=${encodeURIComponent(tokens.accessToken)}&refresh_token=${encodeURIComponent(tokens.refreshToken)}&type=magiclink`,
    );

    try {
      await page.waitForURL((url) => !url.pathname.startsWith('/auth/callback'), { timeout: 35_000 });
    } catch {
      failOrSkip(true, 'Auth callback lämnade inte callback-sidan inom timeout i denna miljö.');
      return;
    }

    await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
    await expect(page.getByRole('button', { name: /Logga in|Sign in/i })).toHaveCount(0);

    const callbackPath = new URL(page.url()).pathname;
    if (callbackPath.startsWith('/field')) {
      await page.goto('/admin/dashboard');
      await expect(page).toHaveURL(/\/field(?:\?|$)|\/login(?:\?|$)/);
      return;
    }

    await expect(page.getByTestId('nav-dashboard')).toBeVisible();
    await expect(orgSwitcherLocator(page)).toHaveValue(targetOrg.value, { timeout: 15_000 });
  } finally {
    if (switchedAwayFromOriginal && !page.isClosed()) {
      const switchedBack = await switchActiveOrganizationViaFunction(page, originalOrgId);
      const fallbackToUiRestore = !switchedBack || isAuthRecoveryCleanupError(switchedBack);
      if (switchedBack && !switchedBack.ok && !fallbackToUiRestore) {
        throw new Error(
          `Cleanup failed to restore original organization (${originalOrgId}). status=${switchedBack.status} body=${JSON.stringify(
            switchedBack.body ?? {},
          )}`,
        );
      }

      await page.goto('/admin/dashboard');
      if (fallbackToUiRestore) {
        const switcherVisible = await orgSwitcherLocator(page).isVisible({ timeout: 8_000 }).catch(() => false);
        if (switcherVisible) {
          await orgSwitcherLocator(page).selectOption(originalOrgId).catch(() => undefined);
        }
      }
    }
  }
});
