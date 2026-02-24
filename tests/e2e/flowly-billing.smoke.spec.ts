import { test, expect } from '@playwright/test';

test.setTimeout(120_000);

test('field sign-off drives billing READY -> SENT -> INVOICED', async ({ page }) => {
  const base = 'http://127.0.0.1:4173';

  await page.goto(`${base}/admin/dashboard`);
  await page.getByRole('button', { name: 'Fältapp' }).click();
  await expect(page.getByText('Min Dag')).toBeVisible();

  // Open first field job card in demo mode.
  await page.getByText('Nordic Coffee House').first().click();

  // Add one time row.
  await page.getByPlaceholder('Beskrivning (t.ex. Felsökning)').fill('Service utförd på plats');
  await page.getByPlaceholder('Minuter').fill('45');
  await page.getByRole('button', { name: 'Lägg till Tid' }).click();

  // Add one material row.
  await page.getByPlaceholder('Artikelnamn / SKU').fill('Filterkit A');
  await page.getByPlaceholder('Antal').fill('1');
  await page.getByPlaceholder('Pris').fill('199');
  await page.getByRole('button', { name: 'Lägg till Del' }).click();

  // Add report and complete/sign.
  await page.getByPlaceholder('Beskriv utfört arbete...').fill('Bytt filter, trycktest och funktionskontroll utförd.');
  await page.getByRole('button', { name: /Slutför/ }).click();
  await page.getByRole('button', { name: /Klart & Signera/ }).click();

  // Verify job enters billing READY queue.
  await page.evaluate(() => {
    window.history.pushState({}, '', '/admin/billing?tab=ready');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForURL(/\/admin\/billing/);
  await expect(page.getByText(/Faktureringskö|Billing Queue/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Nordic Coffee House')).toBeVisible();

  // Move READY -> SENT.
  await page.getByRole('button', { name: 'Skicka faktura' }).first().click();

  // Move SENT -> INVOICED.
  await page.getByRole('button', { name: /^Skickad \(\d+\)$/ }).click();
  await expect(page.getByText('Nordic Coffee House')).toBeVisible();
  await page.getByRole('button', { name: 'Markera som fakturerad' }).first().click();

  // Verify in INVOICED tab.
  await page.getByRole('button', { name: /^Fakturerad \(\d+\)$/ }).click();
  await expect(page.getByText('Nordic Coffee House')).toBeVisible();
});
