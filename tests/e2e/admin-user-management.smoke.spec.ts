import { expect, test } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';

test.setTimeout(180_000);

test('admin can open user management and see status/role actions', async ({ page }) => {
  await page.goto('/admin/resources');
  await ensureAuthenticated(page);
  await page.goto('/admin/resources');

  await expect(page).toHaveURL(/\/admin\/resources/);
  await expect(page.getByRole('button', { name: /Tekniker|Technicians/i })).toBeVisible();
  await page.getByRole('button', { name: /Tekniker|Technicians/i }).click();

  await expect(page.getByRole('columnheader', { name: /Role|Roll/i })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Status/i })).toBeVisible();

  const actionButton = page.getByRole('button', { name: /Deactivate|Inaktivera|Reactivate|Aktivera/i }).first();
  await expect(actionButton).toBeVisible();
});
