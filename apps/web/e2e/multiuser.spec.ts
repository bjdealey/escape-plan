import { expect, test } from '@playwright/test';

async function actAs(page: import('@playwright/test').Page, name: string) {
  await page.getByLabel('Act as user (dev)').click();
  await page.getByRole('option', { name }).click();
}

/**
 * Multi-user journey on seeded data (no keys, no backend):
 * invite → accept → request leave → approver approves → status updates;
 * plus a household member co-editing a shared plan.
 */
test('invite, accept, request, approve, and co-edit a shared plan', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('escape-plan-onboarded', 'true'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Your 2026 escape plan/i })).toBeVisible();
  await page.getByRole('tab', { name: 'Group' }).click();

  // 1) Team owner invites Sam by email.
  await actAs(page, 'Priya Shah');
  await page.getByRole('tab', { name: /Product Team/ }).click();
  await page.getByLabel('Email').fill('sam@escape-plan.app');
  await page.getByRole('button', { name: 'Invite' }).click();
  await expect(page.getByText('sam@escape-plan.app')).toBeVisible();

  // 2) Sam accepts the invitation and becomes a member.
  await actAs(page, 'Sam Rivera');
  await page.getByRole('button', { name: 'Accept' }).first().click();
  await expect(page.getByRole('tab', { name: /Product Team/ })).toBeVisible();

  // 3) Sam requests leave in the team → pending (teams require approval).
  await page.getByRole('button', { name: 'Request' }).click();
  await expect(page.getByText('pending').first()).toBeVisible();

  // 4) An approver approves; the request flips to approved.
  await actAs(page, 'Sofia Marin');
  await page.getByRole('tab', { name: /Product Team/ }).click();
  await page.getByRole('button', { name: 'Approve' }).first().click();
  await expect(page.getByText('approved').first()).toBeVisible();

  // 5) Couple co-editing: Sam has co-edit access to the household-shared plan.
  await actAs(page, 'Sam Rivera');
  await page.getByRole('tab', { name: /Rivera Household/ }).click();
  await expect(page.getByText('coedit').first()).toBeVisible();
});

test('a member cannot invite in a team (deny-by-default surfaced in UI)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('escape-plan-onboarded', 'true'));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Group' }).click();
  // Default user (Demo) is a plain member of the team.
  await page.getByRole('tab', { name: /Product Team/ }).click();
  await expect(page.getByText(/don’t have permission to invite/i)).toBeVisible();
});
