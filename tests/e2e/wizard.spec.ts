import { test, expect } from '@playwright/test';

test.describe('ElateTrips planner', () => {
  test('renders the planner shell', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Plan your perfect celebration trip' })).toBeVisible();
    await expect(page.getByText('Where to?')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue to hotels' })).toBeDisabled();
  });

  test('selects a live destination via typeahead', async ({ page }) => {
    await page.goto('/');
    const input = page.getByPlaceholder('Search a destination — try Ooty');
    await input.click();
    await input.fill('Ooty');
    await page.getByRole('option', { name: /Ooty/ }).click();
    await expect(input).toHaveValue('Ooty');
  });

  test('switches the celebration theme', async ({ page }) => {
    await page.goto('/');
    const root = page.locator('.et-theme-root');
    const before = await root.evaluate((el) => getComputedStyle(el).getPropertyValue('--primary'));
    await page.getByRole('button', { name: 'Sunset' }).click();
    await expect
      .poll(async () => root.evaluate((el) => getComputedStyle(el).getPropertyValue('--primary')))
      .not.toBe(before);
  });

  test('adds a gift to the shared cart', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Surprise Gifts' }).click();
    await expect(page.getByRole('heading', { name: 'Surprise Gifts' })).toBeVisible();
    await page
      .locator('div', { hasText: 'Red Roses Bouquet' })
      .getByRole('button', { name: 'Add to cart' })
      .first()
      .click();
    await expect(page.getByText(/^1 · ₹/)).toBeVisible();
  });
});
