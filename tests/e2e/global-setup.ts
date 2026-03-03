import { chromium } from '@playwright/test';

const LOGIN_BUTTON_NAME = /Logga in|Sign in/i;

export default async function globalSetup() {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required. Set them in .env.local.',
    );
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });

  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: LOGIN_BUTTON_NAME }).click();
  await page.waitForURL('**/admin/**', { timeout: 30_000 });

  await page.context().storageState({ path: '.auth/admin.json' });
  await browser.close();
}
