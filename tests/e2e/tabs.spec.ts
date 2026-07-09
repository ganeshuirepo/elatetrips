import { test, expect, type Page } from '@playwright/test';

/**
 * The tabbed storefront: six independent product tabs over a shared trip bar
 * and one shared cart. Each tab must be orderable alone; combinations meet
 * on the review screen.
 */

/** Fill destination + a future date range in the trip bar (no Search click). */
async function fillTrip(page: Page) {
  const input = page.getByPlaceholder('Search a destination — try Ooty');
  await input.click();
  await input.fill('Ooty');
  await page.getByRole('option', { name: /Ooty/ }).click();

  await page.getByText('Select date').first().click();
  const days = page.locator('button:not([disabled])').filter({ hasText: /^\d{1,2}$/ });
  const n = await days.count();
  await days.nth(Math.max(0, n - 10)).click();
  const days2 = page.locator('button:not([disabled])').filter({ hasText: /^\d{1,2}$/ });
  await days2.nth(Math.max(0, (await days2.count()) - 7)).click();
  await page.keyboard.press('Escape');
}

/** Fill the trip and hit Search — reveals the hotel listing on the Hotels tab. */
async function searchTrip(page: Page) {
  await fillTrip(page);
  await page.getByRole('button', { name: 'Search stays' }).click();
}

const tab = (page: Page, name: string | RegExp) => page.getByRole('tab', { name });

test.describe('tabbed storefront shell', () => {
  test('renders the trip bar and all six tabs, hotels active', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Your trip')).toBeVisible();
    for (const name of [
      'Hotels',
      'Cabs',
      'Celebrations & Experiences',
      'Surprise Gifts',
      'On-ground Services',
      'Itinerary',
    ]) {
      await expect(tab(page, name)).toBeVisible();
    }
    await expect(tab(page, 'Hotels')).toHaveAttribute('aria-selected', 'true');
    // No listing until a trip is searched — the tab prompts for a search.
    await expect(page.getByText('Search stays in Ooty')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search stays' })).toBeDisabled();
    await expect(page.getByText(/Pick your stay/)).toBeHidden();
  });

  test('every tab opens crash-free with a fresh store', async ({ page }) => {
    await page.goto('/');
    for (const name of [
      'Cabs',
      'Celebrations & Experiences',
      'Surprise Gifts',
      'On-ground Services',
      'Itinerary',
      'Hotels',
    ]) {
      await tab(page, name).click();
      await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
    }
  });
});

test.describe('independent orders', () => {
  test('gifts-only: add from the Gifts tab and reach review', async ({ page }) => {
    await page.goto('/');
    await tab(page, 'Surprise Gifts').click();
    await page
      .locator('div', { hasText: 'Red Roses Bouquet' })
      .getByRole('button', { name: 'Add to cart' })
      .first()
      .click();
    await expect(page.getByText(/^1 · ₹/)).toBeVisible();

    await page.getByRole('button', { name: 'Review order' }).click();
    await expect(page.getByText('Red Roses Bouquet')).toBeVisible();
    await expect(page.getByRole('button', { name: /Proceed to payment/ })).toBeVisible();
  });

  test('cab-only: configure a local cab, add to trip, cart prices it', async ({ page }) => {
    await page.goto('/');
    await fillTrip(page);
    await tab(page, 'Cabs').click();

    // No own-vs-cab question — the tab starts at the trip type.
    await page.getByText('Local trips', { exact: false }).first().click();
    await page.getByText('Sedan', { exact: false }).first().click();

    const addBtn = page.getByRole('button', { name: /Add cab to trip/ });
    await expect(addBtn).toBeEnabled();
    await addBtn.click();
    await expect(page.getByText('Cab added to your trip')).toBeVisible();
    await expect(page.getByText(/^1 · ₹/)).toBeVisible();

    // Remove puts the tab back to the add state and empties the cart.
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('button', { name: /Add cab to trip/ })).toBeVisible();
  });

  test('hotel-only: search, pick a room, stay lands in the cart', async ({ page }) => {
    await page.goto('/');
    await searchTrip(page);
    await page.getByRole('button', { name: /View details/ }).first().click();
    await expect(page.getByRole('button', { name: 'Back to hotels' })).toBeVisible();
    await page.getByRole('button', { name: 'Select room' }).first().click();
    await expect(page.getByText(/^1 · ₹/)).toBeVisible();
  });

  test('no listing and Search disabled until a destination and dates are set', async ({ page }) => {
    await page.goto('/');
    // Fresh store: the Hotels tab prompts to search and the button is disabled.
    await expect(page.getByText('Search stays in Ooty')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search stays' })).toBeDisabled();
    // With a trip filled, Search enables and reveals the listing.
    await searchTrip(page);
    await expect(page.getByText(/Pick your stay/)).toBeVisible();
  });
});

test.describe('combined order', () => {
  test('hotel + cab + gift meet on the review screen', async ({ page }) => {
    await page.goto('/');
    await searchTrip(page);

    // Stay
    await page.getByRole('button', { name: /View details/ }).first().click();
    await page.getByRole('button', { name: 'Select room' }).first().click();
    await page.getByRole('button', { name: 'Back to hotels' }).click();

    // Cab
    await tab(page, 'Cabs').click();
    await page.getByText('Local trips', { exact: false }).first().click();
    await page.getByText('Sedan', { exact: false }).first().click();
    await page.getByRole('button', { name: /Add cab to trip/ }).click();

    // Gift
    await tab(page, 'Surprise Gifts').click();
    await page
      .locator('div', { hasText: 'Red Roses Bouquet' })
      .getByRole('button', { name: 'Add to cart' })
      .first()
      .click();

    await expect(page.getByText(/^3 · ₹/)).toBeVisible();
    await page.getByRole('button', { name: 'Review order' }).click();
    await expect(page.getByText('Red Roses Bouquet')).toBeVisible();
    await expect(page.getByText(/Local sightseeing/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Proceed to payment/ })).toBeVisible();

    // Back returns to the tabs.
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(tab(page, 'Hotels')).toBeVisible();
  });
});
