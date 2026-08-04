import { test, expect } from '@playwright/test';

/** After login, the seeded owner can reach the core management screens. */
async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('שם משתמש או דוא"ל').fill('owner@demo.crm');
  await page.getByLabel('סיסמה').fill('Passw0rd!');
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe('navigation', () => {
  test('owner can open computers, customers and floor plan', async ({ page }) => {
    await login(page);

    await page.getByRole('link', { name: 'מחשבים' }).click();
    await expect(page.getByRole('heading', { name: 'מחשבים' })).toBeVisible();

    await page.getByRole('link', { name: 'לקוחות' }).click();
    await expect(page.getByRole('heading', { name: 'לקוחות' })).toBeVisible();

    await page.getByRole('link', { name: 'חדרים בזמן אמת' }).click();
    await expect(page.getByRole('heading', { name: 'חדרים בזמן אמת' })).toBeVisible();
  });
});
