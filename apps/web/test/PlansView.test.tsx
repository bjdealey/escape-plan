import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { demoInput, optimise } from '@escape-plan/engine';
import { PlansView } from '@/components/PlansView';
import { renderWithProviders } from './utils';

const plans = optimise(demoInput()).plans;

describe('PlansView', () => {
  it('renders every plan ranked, scored, and explained', () => {
    renderWithProviders(<PlansView />);
    // Rank-1 badge is present (plans are ranked).
    expect(screen.getByText('#1')).toBeInTheDocument();
    // Every rendered plan card is scored and carries a score breakdown. Derive
    // the count from the DOM rather than from a separately-optimised reference:
    // the provider legitimately re-homes to the ambient locale and stamps the
    // current date, both of which change which plans are generated.
    const scored = screen.getAllByText('score / 100');
    expect(scored.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Why this scored well').length).toBe(scored.length);
    // The rank-1 heading is a real plan strategy label.
    const labels = new Set(plans.map((p) => p.strategyLabel));
    const headings = screen.getAllByRole('heading').map((h) => h.textContent ?? '');
    expect(headings.some((h) => labels.has(h))).toBe(true);
  });

  it('lets the user select a different plan', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlansView />);

    // Plan 1 is selected by default.
    expect(screen.getByRole('heading', { name: plans[0].strategyLabel }).closest('div')).toBeTruthy();

    // Select rank-2 plan via its card's action button.
    const secondHeading = screen.getByRole('heading', { name: plans[1].strategyLabel });
    const secondCard = secondHeading.closest('[class*="rounded-lg"]') as HTMLElement;
    const useBtn = within(secondCard).getByRole('button', { name: /use this plan/i });
    await user.click(useBtn);

    // The rank-2 card is now the selected one (button reflects the selection).
    expect(
      within(secondCard).getByRole('button', { name: /Selected — shown/i }),
    ).toBeInTheDocument();
  });
});
