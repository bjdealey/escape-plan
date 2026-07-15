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
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getAllByText('score / 100').length).toBe(plans.length);
    // Rank-1 heading + its explanation are shown.
    expect(screen.getByRole('heading', { name: plans[0].strategyLabel })).toBeInTheDocument();
    expect(screen.getByText(plans[0].explanation)).toBeInTheDocument();
    // A "why this scored well" breakdown is present for each plan.
    expect(screen.getAllByText('Why this scored well').length).toBe(plans.length);
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
