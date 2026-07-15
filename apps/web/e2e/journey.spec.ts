import { expect, test } from '@playwright/test';

/**
 * Core journey against seeded data (no keys, no backend):
 * onboard → set allowance/prefs → generate ranked plans → inspect explanation
 * → select ("book") a plan → see it reflected on the calendar.
 */
test('a first-time user can produce and inspect a usable plan', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');

  // Onboarding
  await expect(page.getByText(/build your 2026 plan/i)).toBeVisible();
  const remaining = page.getByLabel('Days remaining');
  await remaining.fill('22');
  await expect(remaining).toHaveValue('22');

  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Next' }).click();
  }
  await expect(page.getByText(/Step 4 \/ 4/)).toBeVisible();
  await page.getByRole('button', { name: /generate my plans/i }).click();

  // Main app
  await expect(page.getByRole('heading', { name: /Your 2026 escape plan/i })).toBeVisible();

  // Ranked plans with explanations
  await page.getByRole('tab', { name: 'Plans' }).click();
  await expect(page.getByText('#1')).toBeVisible();
  const scores = page.getByText('score / 100');
  expect(await scores.count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByText(/days off/).first()).toBeVisible();

  // "Book" a different plan by selecting it.
  const useButtons = page.getByRole('button', { name: /use this plan/i });
  await useButtons.first().click();
  await expect(page.getByRole('button', { name: /Selected — shown/i }).first()).toBeVisible();

  // Calendar reflects the selection with layered events.
  await page.getByRole('tab', { name: 'Calendar' }).click();
  await expect(page.getByText(/at a glance/i)).toBeVisible();
  // Legend confirms the layered calendar rendered.
  await expect(page.getByText('Bank holiday', { exact: true })).toBeVisible();
});
