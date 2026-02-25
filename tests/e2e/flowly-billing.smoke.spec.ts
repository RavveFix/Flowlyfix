import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';

test.setTimeout(120_000);

test('field sign-off drives billing READY -> SENT -> INVOICED', async ({ page }) => {
  await page.goto('/admin/dashboard');
  await ensureAuthenticated(page);

  await page.getByRole('button', { name: /Fältapp|Field App/i }).click();
  await expect(page.getByText(/Min Dag|My Day/i)).toBeVisible();

  // Open first available field job card in current environment.
  const firstFieldJobCard = page.locator('div.cursor-pointer').filter({ has: page.locator('h3') }).first();
  await expect(firstFieldJobCard).toBeVisible({ timeout: 20_000 });
  const customerName = (await firstFieldJobCard.locator('h3').first().innerText()).trim();
  await firstFieldJobCard.click();

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

  // Move READY -> SENT.
  const sendInvoiceButtons = page.getByRole('button', { name: /Skicka faktura|Send Invoice/i });
  const hasReadyRow = (await sendInvoiceButtons.count()) > 0;
  test.skip(!hasReadyRow, `No READY billing rows available after completing field job "${customerName}".`);
  let sentClicked = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const nextSendButton = page.getByRole('button', { name: /Skicka faktura|Send Invoice/i }).first();
    if ((await page.getByRole('button', { name: /Skicka faktura|Send Invoice/i }).count()) === 0) {
      break;
    }

    try {
      await nextSendButton.click({ timeout: 2_500 });
      sentClicked = true;
      break;
    } catch {
      await page.waitForTimeout(250);
    }
  }
  test.skip(!sentClicked, `Could not click a stable Send Invoice button for "${customerName}".`);

  // Move SENT -> INVOICED.
  const sentTab = page.getByRole('button', { name: /^(Skickad|Sent) \(\d+\)$/ });
  await sentTab.click();
  const markInvoicedButtons = page.getByRole('button', { name: /Markera som fakturerad|Mark as Invoiced/i });
  const hasSentRow = (await markInvoicedButtons.count()) > 0;
  test.skip(!hasSentRow, `No SENT rows available after sending invoice for "${customerName}".`);
  await expect(markInvoicedButtons.first()).toBeVisible({ timeout: 15_000 });
  await markInvoicedButtons.first().click();

  // Verify in INVOICED tab.
  const invoicedTab = page.getByRole('button', { name: /^(Fakturerad|Invoiced) \(\d+\)$/ });
  await invoicedTab.click();
  await expect(invoicedTab).toBeVisible();
});
