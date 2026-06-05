import { test, expect } from '@playwright/test';

test('login page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/ledger|finance|login/i);
});

test('login form is visible', async ({ page }) => {
  await page.goto('/');
  const loginButton = page.locator('button, a').filter({ hasText: /login|sign in|google/i }).first();
  await expect(loginButton).toBeVisible();
});
