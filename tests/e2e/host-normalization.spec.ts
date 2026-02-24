import { expect, test } from '@playwright/test';

test('dev canonical origin normalizes 127.0.0.1 to localhost', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/');

  await expect.poll(() => new URL(page.url()).hostname).toBe('localhost');
  await expect(page).toHaveURL(/^http:\/\/localhost:3000\//);
});
