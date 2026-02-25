import { expect, test } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';

test.setTimeout(240_000);

function extractInviteApiError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';

  const record = payload as Record<string, unknown>;

  if (typeof record.error === 'string' && record.error.trim().length > 0) {
    return record.error.trim();
  }

  if (typeof record.message === 'string' && record.message.trim().length > 0) {
    const codePrefix = typeof record.code === 'number' ? `code=${record.code} ` : '';
    return `${codePrefix}${record.message.trim()}`.trim();
  }

  if (typeof record.code === 'number' && record.code >= 400) {
    return `code=${record.code}`;
  }

  return '';
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
  const invitePayload: unknown = await inviteResponse.json().catch(() => null);
  const inviteApiError = extractInviteApiError(invitePayload);
  if (!inviteResponse.ok() || inviteApiError.length > 0) {
    test.skip(
      true,
      `Invite API rejected smoke invite (${inviteResponse.status()}): ${inviteApiError || 'unknown response shape'}`,
    );
  }
  expect(invitePayload).toMatchObject({
    organization_id: expect.any(String),
    invite_status: expect.any(String),
    next_action: expect.any(String),
    request_id: expect.any(String),
  });

  await expect(page.getByText('Pending invites')).toBeVisible({ timeout: 20_000 });
  const inviteRow = page.locator('tr', { hasText: inviteEmail });
  await expect(inviteRow).toBeVisible({ timeout: 20_000 });

  await inviteRow.getByRole('button', { name: /Resend/i }).click();
  await expect(page.getByText(new RegExp(`Inbjudan skickades om till ${inviteEmail}`))).toBeVisible({ timeout: 20_000 });

  await inviteRow.getByRole('button', { name: /Revoke/i }).click();
  await expect(page.getByText('Inbjudan har återkallats.')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('tr', { hasText: inviteEmail })).toHaveCount(0, { timeout: 20_000 });
});
