import { expect, test } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { ensureAdminSmokeWorkshopFixture } from './helpers/adminSmokeFixture';

test.setTimeout(180_000);

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

test('admin smoke: dispatch, workshop and billing flow', async ({ page }) => {
  const workshopFixture = await ensureAdminSmokeWorkshopFixture().catch(() => null);
  failOrSkip(!workshopFixture, 'Could not provision workshop fixture data for admin smoke.');
  if (!workshopFixture) {
    return;
  }

  const reportText = `Workshop smoke report ${Date.now()}`;
  const adjustedReport = `${reportText}\nAdminjusterat underlag.`;

  await page.goto('/admin/dashboard');
  await ensureAuthenticated(page);

  const sidebar = page.locator('aside');
  await expect(sidebar.getByRole('button', { name: /Planering|Dispatch/i })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: /Verkstad|Workshop/i })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: /Fakturering|Billing/i })).toBeVisible();

  // Dispatch: assign an open field job.
  await sidebar.getByRole('button', { name: /Planering|Dispatch/i }).click();
  await page.waitForURL(/\/admin\/dispatch/);
  await expect(page.getByText(/Planeringstavla|Dispatch Board/i)).toBeVisible({ timeout: 15_000 });
  const assignButtons = page.getByRole('button', { name: /^(Tilldela|Assign)$/ });
  const hasAssignableDispatchItem = (await assignButtons.count()) > 0;
  if (hasAssignableDispatchItem) {
    await assignButtons.first().click();
    const confirmAssign = page.getByRole('button', { name: /Tilldela jobb|Assign Job/i }).first();
    if (await confirmAssign.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await confirmAssign.click();
      await expect(assignButtons).toHaveCount(0, { timeout: 15_000 });
    }
  }

  // Workshop: complete and sign with report, time and part logs.
  await sidebar.getByRole('button', { name: /Verkstad|Workshop/i }).click();
  await page.waitForURL(/\/admin\/workshop/);
  await expect(page.getByText(/Verkstadstavla|Workshop Board/i)).toBeVisible({ timeout: 15_000 });
  const fixtureWorkshopCard = page
    .locator('div.cursor-pointer')
    .filter({ hasText: workshopFixture.description })
    .first();
  const fixtureCardVisible = await fixtureWorkshopCard.isVisible({ timeout: 15_000 }).catch(() => false);
  const workshopCards = page.locator('div.cursor-pointer').filter({ has: page.locator('h4') });
  const hasWorkshopCards = (await workshopCards.count()) > 0;
  failOrSkip(
    !fixtureCardVisible && !hasWorkshopCards,
    'No workshop jobs available for admin ops smoke in this environment.',
  );

  const firstWorkshopCard = fixtureCardVisible ? fixtureWorkshopCard : workshopCards.first();
  await expect(firstWorkshopCard).toBeVisible({ timeout: 15_000 });
  const workshopCustomerName = (await firstWorkshopCard.locator('h4').first().innerText()).trim();
  await firstWorkshopCard.click();

  await page.getByPlaceholder(/Beskriv utfört arbete|Describe what was done/i).fill(reportText);

  await page.getByRole('button', { name: /^(Tid|Time)$/ }).click();
  await page.getByPlaceholder(/Beskrivning|Description/i).fill('Extra felsökning');
  await page.getByPlaceholder(/Minuter|Minutes/i).fill('25');
  await page.getByRole('button', { name: /Lägg till Tid|Add Time/i }).click();
  await expect(page.getByText('Extra felsökning')).toBeVisible();

  await page.getByRole('button', { name: /Material|Parts/i }).click();
  await page.getByPlaceholder(/Artikelnamn \/ SKU|Part Name \/ SKU/i).fill('Workshop-filter');
  await page.getByPlaceholder(/Antal|Qty/i).fill('2');
  await page.getByPlaceholder(/Pris|Cost/i).fill('150');
  await page.getByRole('button', { name: /Lägg till Del|Add Part/i }).click();
  await expect(page.getByText('Workshop-filter')).toBeVisible();

  await page.getByRole('button', { name: /Klart & Signera|Complete & Sign/i }).click();
  await expect(page.getByRole('button', { name: /Klart & Signera|Complete & Sign/i })).toHaveCount(0);

  // Billing: verify READY and transition to SENT and INVOICED.
  await sidebar.getByRole('button', { name: /Fakturering|Billing/i }).click();
  await page.waitForURL(/\/admin\/billing/);
  await expect(page.getByText(/Faktureringskö|Billing Queue/i)).toBeVisible({ timeout: 15_000 });
  const readyFixtureRow = page
    .locator('div.bg-white.border.border-gray-200.rounded-xl')
    .filter({ hasText: reportText })
    .first();
  await expect(readyFixtureRow).toBeVisible({ timeout: 15_000 });

  await readyFixtureRow.getByRole('button', { name: /Redigera underlag|Edit Details/i }).first().click();
  await page.getByPlaceholder(/Beskriv vad som utfördes|Describe what was done/i).fill(adjustedReport);
  await readyFixtureRow.getByRole('button', { name: /Spara underlag|Save Details/i }).first().click();

  const adjustedFixtureRow = page
    .locator('div.bg-white.border.border-gray-200.rounded-xl')
    .filter({ hasText: adjustedReport })
    .first();
  await expect(adjustedFixtureRow).toBeVisible({ timeout: 15_000 });

  await adjustedFixtureRow.getByRole('button', { name: /Skicka faktura|Send Invoice/i }).first().click();
  await page.getByRole('button', { name: /^(Skickad|Sent) \(\d+\)$/ }).click();
  await expect(page.getByText(adjustedReport)).toBeVisible();

  const sentFixtureRow = page
    .locator('div.bg-white.border.border-gray-200.rounded-xl')
    .filter({ hasText: adjustedReport })
    .first();
  await sentFixtureRow.getByRole('button', { name: /Återöppna|Reopen to Ready/i }).first().click();
  await page.getByRole('button', { name: /^(Klar|Ready) \(\d+\)$/ }).click();
  await expect(page.getByText(adjustedReport)).toBeVisible();

  const reopenedReadyFixtureRow = page
    .locator('div.bg-white.border.border-gray-200.rounded-xl')
    .filter({ hasText: adjustedReport })
    .first();
  await reopenedReadyFixtureRow.getByRole('button', { name: /Skicka faktura|Send Invoice/i }).first().click();
  await page.getByRole('button', { name: /^(Skickad|Sent) \(\d+\)$/ }).click();
  await expect(page.getByText(adjustedReport)).toBeVisible();

  const sentAgainFixtureRow = page
    .locator('div.bg-white.border.border-gray-200.rounded-xl')
    .filter({ hasText: adjustedReport })
    .first();
  await sentAgainFixtureRow.getByRole('button', { name: /Markera som fakturerad|Mark as Invoiced/i }).first().click();
  await page.getByRole('button', { name: /^(Fakturerad|Invoiced) \(\d+\)$/ }).click();
  await expect(page.getByText(adjustedReport).first()).toBeVisible();
});
