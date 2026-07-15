import { expect, test } from '@playwright/test';

async function actAs(page: import('@playwright/test').Page, name: string) {
  await page.getByLabel('Act as user (dev)').click();
  await page.getByRole('option', { name }).click();
}
const bell = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /Notifications, \d+ unread/ });

test('invite → recipient notified → deep-link opens the group screen', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('escape-plan-onboarded', 'true'));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Group' }).click();

  // Owner invites Sam.
  await actAs(page, 'Priya Shah');
  await page.getByRole('tab', { name: /Product Team/ }).click();
  await page.getByLabel('Email').fill('sam@escape-plan.app');
  await page.getByRole('button', { name: 'Invite' }).click();

  // Sam is notified in-app; the deep link opens the Group screen.
  await actAs(page, 'Sam Rivera');
  await bell(page).click();
  const item = page.getByText(/invited to Product Team/i);
  await expect(item).toBeVisible();
  await item.click();
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
});

test('leave requested → approver notified → approves → requester notified', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('escape-plan-onboarded', 'true'));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Group' }).click();

  // Demo (a team member) requests leave.
  await page.getByRole('tab', { name: /Product Team/ }).click();
  await page.getByRole('button', { name: 'Request' }).click();

  // Approver Sofia is notified of the request.
  await actAs(page, 'Sofia Marin');
  await bell(page).click();
  await expect(page.getByText(/Leave request from Demo User/i)).toBeVisible();
  // Close the panel and approve from the queue.
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: /Product Team/ }).click();
  await page.getByRole('button', { name: 'Approve' }).first().click();

  // The requester (Demo) is notified the leave was approved.
  await actAs(page, 'Demo User');
  await bell(page).click();
  await expect(page.getByText('Leave approved').first()).toBeVisible();
});
