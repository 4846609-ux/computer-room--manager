import { test, expect } from '@playwright/test';

/**
 * Smoke E2E: the login page renders in Hebrew/RTL and a seeded owner can sign in
 * and reach the dashboard. Requires the stack running with seed data
 * (owner@demo.crm / Passw0rd!).
 */
test.describe('authentication', () => {
  test('login page renders RTL Hebrew', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.getByRole('button', { name: 'כניסה' })).toBeVisible();
  });

  test('seeded owner can sign in and reach the dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('שם משתמש או דוא"ל').fill('owner@demo.crm');
    await page.getByLabel('סיסמה').fill('Passw0rd!');
    await page.getByRole('button', { name: 'כניסה' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();
  });
});
