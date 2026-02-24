import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';

test.setTimeout(120_000);

test('field sign-off drives billing READY -> SENT -> INVOICED', async ({ page }) => {
  await page.goto('/admin/dashboard');
  await ensureAuthenticated(page);

  await page.getByRole('button', { name: /Fältapp|Field App/i }).click();
  await expect(page.getByText(/Min Dag|My Day/i)).toBeVisible();

  // Open first field job card in demo mode.
  await page.getByText('Nordic Coffee House').first().click();

  // Add one time row.
  await page.getByPlaceholder(/Beskrivning \(t\.ex\. Felsökning\)|Description \(e\.g\. Diagnostics\)/i).fill('Service utförd på plats');
  await page.getByPlaceholder(/Minuter|Minutes/i).fill('45');
  await page.getByRole('button', { name: /Lägg till Tid|Add Time/i }).click();

  // Add one material row.
  await page.getByPlaceholder(/Artikelnamn \/ SKU|Part Name \/ SKU/i).fill('Filterkit A');
  await page.getByPlaceholder(/Antal|Qty/i).fill('1');
  await page.getByPlaceholder(/Pris|Cost/i).fill('199');
  await page.getByRole('button', { name: /Lägg till Del|Add Part/i }).click();

  // Add report and complete/sign.
  await page.getByPlaceholder(/Beskriv utfört arbete|Describe work done/i).fill('Bytt filter, trycktest och funktionskontroll utförd.');
  await page.getByRole('button', { name: /Slutför|Complete/i }).click();
  await page.getByRole('button', { name: /Klart & Signera|Complete & Sign/i }).click();

  // Verify job enters billing READY queue.
  await page.evaluate(() => {
    window.history.pushState({}, '', '/admin/billing?tab=ready');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForURL(/\/admin\/billing/);
  await expect(page.getByText(/Faktureringskö|Billing Queue/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Nordic Coffee House')).toBeVisible();

  // Move READY -> SENT.
  await page.getByRole('button', { name: /Skicka faktura|Send Invoice/i }).first().click();

  // Move SENT -> INVOICED.
  await page.getByRole('button', { name: /^(Skickad|Sent) \(\d+\)$/ }).click();
  await expect(page.getByText('Nordic Coffee House')).toBeVisible();
  await page.getByRole('button', { name: /Markera som fakturerad|Mark as Invoiced/i }).first().click();

  // Verify in INVOICED tab.
  await page.getByRole('button', { name: /^(Fakturerad|Invoiced) \(\d+\)$/ }).click();
  await expect(page.getByText('Nordic Coffee House')).toBeVisible();
});
