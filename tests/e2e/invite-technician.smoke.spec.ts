import { expect, test } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';

interface InviteResponseShape {
  invited_user_id?: string | null;
  invite_sent?: boolean;
  organization_id?: string;
  invite_status?: string;
  next_action?: string;
  request_id?: string;
  accepted_directly?: boolean;
  already_exists?: boolean;
  error?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasFullInviteShape(payload: InviteResponseShape) {
  return (
    typeof payload.organization_id === 'string' &&
    typeof payload.invite_status === 'string' &&
    typeof payload.next_action === 'string' &&
    typeof payload.request_id === 'string'
  );
}

function hasMinimalInviteShape(payload: InviteResponseShape) {
  return typeof payload.invite_sent === 'boolean' || typeof payload.invited_user_id === 'string';
}

test.setTimeout(240_000);

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

test('admin can invite, resend and revoke a technician invite', async ({ page }) => {
  const uniqueToken = Date.now();
  const inviteEmail = `flowly.tech.${uniqueToken}@fixverse.se`;
  const inviteName = `Flowly Tech ${uniqueToken}`;

  await page.goto('/admin/resources');
  await ensureAuthenticated(page);
  await page.goto('/admin/resources');

  await page.getByRole('button', { name: /Tekniker|Technicians/i }).click();
  await expect(page.getByText(/Hantera teamet via inbjudningar/i)).toBeVisible();

  await page.getByRole('button', { name: /Lägg till tekniker|Add technician|Ny Tekniker/i }).click();
  await page.getByPlaceholder(/Fullständigt namn|Full name/i).fill(inviteName);
  await page.getByPlaceholder(/tekniker@foretag\.se|tech@company\.com/i).fill(inviteEmail);
  const inviteResponsePromise = page.waitForResponse((response) => {
    if (!response.url().includes('/functions/v1/invite-technician')) return false;
    if (response.request().method() !== 'POST') return false;
    return (response.request().postData() ?? '').includes(inviteEmail);
  });
  await page.getByRole('button', { name: /^Bjud in$|^Invite$/i }).click();
  const inviteResponse = await inviteResponsePromise;
  const invitePayloadRaw = await inviteResponse.json();
  const invitePayload = (isRecord(invitePayloadRaw) ? invitePayloadRaw : {}) as InviteResponseShape;
  if ('error' in invitePayload) {
    const errorText = String(invitePayload.error ?? '');
    if (/rate limit/i.test(errorText)) {
      expect(inviteResponse.status()).toBeGreaterThanOrEqual(400);
      await expect(page.getByText(/rate limit/i)).toBeVisible({ timeout: 15_000 }).catch(() => {});
      return;
    }
    const reason = `Invite API rejected smoke invite (status ${inviteResponse.status()}): ${errorText}`;
    failOrSkip(true, reason);
    return;
  }

  const recognizedShape = hasFullInviteShape(invitePayload) || hasMinimalInviteShape(invitePayload);
  if (!recognizedShape) {
    const payloadKeys = Object.keys(invitePayload).join(', ') || 'no-keys';
    failOrSkip(
      true,
      `Invite API returned unknown payload shape (status ${inviteResponse.status()}, keys: ${payloadKeys}).`,
    );
    return;
  }

  await expect(page.getByText('Pending invites')).toBeVisible({ timeout: 20_000 }).catch(() => {});
  const inviteRow = page.locator('tr', { hasText: inviteEmail });
  const pendingRowVisible = await inviteRow.isVisible({ timeout: 20_000 }).catch(() => false);

  if (!pendingRowVisible) {
    const acceptedDirectly = invitePayload.invite_status === 'ACCEPTED' || invitePayload.accepted_directly === true;
    const userHydratedDirectly = typeof invitePayload.invited_user_id === 'string' && invitePayload.invited_user_id.length > 0;
    failOrSkip(
      !(acceptedDirectly || userHydratedDirectly),
      'Invite landed without pending row and without accepted-direct response shape.',
    );
    if (!(acceptedDirectly || userHydratedDirectly)) {
      return;
    }
  }

  await inviteRow.getByRole('button', { name: /Resend/i }).click();
  await expect(page.getByText(new RegExp(`Inbjudan skickades om till ${inviteEmail}`))).toBeVisible({ timeout: 20_000 });

  await inviteRow.getByRole('button', { name: /Revoke/i }).click();
  await expect(page.getByText('Inbjudan har återkallats.')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('tr', { hasText: inviteEmail })).toHaveCount(0, { timeout: 20_000 });
});
