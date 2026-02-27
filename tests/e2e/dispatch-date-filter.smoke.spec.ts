import { expect, test } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';

test.setTimeout(180_000);

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map((segment) => Number(segment));
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  asUtc.setUTCDate(asUtc.getUTCDate() + days);
  return asUtc.toISOString().slice(0, 10);
}

test('dispatch date picker persists selection in URL and repairs invalid date params', async ({ page }) => {
  await page.goto('/admin/dispatch');
  await ensureAuthenticated(page);
  if (!/\/admin\/dispatch(?:\?|$)/.test(page.url())) {
    await page.goto('/admin/dispatch');
  }
  await page.waitForURL(/\/admin\/dispatch/);
  await expect(page.getByText(/Planeringstavla|Dispatch Board/i)).toBeVisible({ timeout: 15_000 });

  const dateInput = page.getByTestId('dispatch-date-input');
  await expect(dateInput).toHaveValue(DATE_KEY_RE);

  const initialDateKey = await dateInput.inputValue();
  expect(initialDateKey).toMatch(DATE_KEY_RE);

  const nextDateKey = addDays(initialDateKey, 1);
  await dateInput.fill(nextDateKey);

  await expect(dateInput).toHaveValue(nextDateKey);
  await expect.poll(() => new URL(page.url()).searchParams.get('date')).toBe(nextDateKey);

  await page.reload();
  await expect.poll(() => new URL(page.url()).searchParams.get('date')).toBe(nextDateKey);
  await expect(dateInput).toHaveValue(nextDateKey);

  await page.goto('/admin/dispatch?date=bad-value');
  await expect.poll(() => new URL(page.url()).searchParams.get('date')).not.toBe('bad-value');
  await expect.poll(() => new URL(page.url()).searchParams.get('date')).toMatch(DATE_KEY_RE);
  await expect(dateInput).toHaveValue(DATE_KEY_RE);
});
