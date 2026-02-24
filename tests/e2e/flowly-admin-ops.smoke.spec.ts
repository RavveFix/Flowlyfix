import { expect, test } from '@playwright/test';

test.setTimeout(180_000);

test('admin smoke: dispatch, workshop and billing flow', async ({ page }) => {
  const base = 'http://127.0.0.1:4173';
  const reportText = `Workshop smoke report ${Date.now()}`;
  const adjustedReport = `${reportText}\nAdminjusterat underlag.`;

  await page.goto(`${base}/admin/dashboard`);

  const sidebar = page.locator('aside');
  await expect(sidebar.getByRole('button', { name: /Planering|Dispatch/i })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: /Verkstad|Workshop/i })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: /Fakturering|Billing/i })).toBeVisible();

  // Dispatch: assign an open field job.
  await sidebar.getByRole('button', { name: /Planering|Dispatch/i }).click();
  await page.waitForURL(/\/admin\/dispatch/);
  await expect(page.getByText(/Planeringstavla|Dispatch Board/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Nordic Coffee House')).toBeVisible();
  await page.getByRole('button', { name: /^(Tilldela|Assign)$/ }).first().click();
  await page.getByRole('button', { name: /Tilldela jobb|Assign Job/i }).first().click();
  await expect(page.getByRole('button', { name: /^(Tilldela|Assign)$/ })).toHaveCount(0);

  // Workshop: complete and sign with report, time and part logs.
  await sidebar.getByRole('button', { name: /Verkstad|Workshop/i }).click();
  await page.waitForURL(/\/admin\/workshop/);
  await expect(page.getByText(/Verkstadstavla|Workshop Board/i)).toBeVisible({ timeout: 15_000 });
  await page.getByText('City Office AB').first().click();

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
  await expect(page.getByText('City Office AB')).toBeVisible();
  await expect(page.getByText(reportText)).toBeVisible();

  await page.getByRole('button', { name: /Redigera underlag|Edit Details/i }).first().click();
  await page.getByPlaceholder(/Beskriv vad som utfördes|Describe what was done/i).fill(adjustedReport);
  await page.getByRole('button', { name: /Spara underlag|Save Details/i }).first().click();
  await expect(page.getByText(adjustedReport)).toBeVisible();

  await page.getByRole('button', { name: /Skicka faktura|Send Invoice/i }).first().click();
  await page.getByRole('button', { name: /^(Skickad|Sent) \(\d+\)$/ }).click();
  await expect(page.getByText('City Office AB')).toBeVisible();

  await page.getByRole('button', { name: /Återöppna|Reopen to Ready/i }).first().click();
  await page.getByRole('button', { name: /^(Klar|Ready) \(\d+\)$/ }).click();
  await expect(page.getByText('City Office AB')).toBeVisible();

  await page.getByRole('button', { name: /Skicka faktura|Send Invoice/i }).first().click();
  await page.getByRole('button', { name: /^(Skickad|Sent) \(\d+\)$/ }).click();
  await expect(page.getByText('City Office AB')).toBeVisible();

  await page.getByRole('button', { name: /Markera som fakturerad|Mark as Invoiced/i }).first().click();
  await page.getByRole('button', { name: /^(Fakturerad|Invoiced) \(\d+\)$/ }).click();
  await expect(page.getByText('City Office AB')).toBeVisible();
});
