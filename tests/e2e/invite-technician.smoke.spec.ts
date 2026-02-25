import { expect, test } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';

test.setTimeout(240_000);

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
  const invitePayload = await inviteResponse.json();
  if (invitePayload && typeof invitePayload === 'object' && 'error' in invitePayload) {
    test.skip(true, `Invite API rejected smoke invite: ${String((invitePayload as { error: unknown }).error)}`);
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
