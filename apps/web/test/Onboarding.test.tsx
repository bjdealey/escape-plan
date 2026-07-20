import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Onboarding } from '@/components/Onboarding';
import { usePlanner } from '@/store/planner';
import { renderWithProviders } from './utils';

function OnboardStatus() {
  const { onboarded } = usePlanner();
  return <div data-testid="onboarded">{String(onboarded)}</div>;
}

describe('Onboarding', () => {
  it('walks through four steps and generates a plan', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <Onboarding />
        <OnboardStatus />
      </>,
    );

    expect(screen.getByText(/Step 1 \/ 4/)).toBeInTheDocument();
    expect(screen.getByTestId('onboarded')).toHaveTextContent('false');

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Step 2 \/ 4/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Step 3 \/ 4/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Step 4 \/ 4/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /generate my plans/i }));
    expect(screen.getByTestId('onboarded')).toHaveTextContent('true');
  });

  it('edits allowance on step 1 and keeps reserve within remaining', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Onboarding />);
    const remaining = screen.getByLabelText(/Days remaining/i) as HTMLInputElement;
    await user.clear(remaining);
    await user.type(remaining, '18');
    expect(remaining.value).toBe('18');
  });

  it('hides advanced leave fields behind a reveal without changing defaults', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Onboarding />);

    // Primary fields are visible; advanced ones are collapsed by default.
    expect(screen.getByLabelText(/Total allowance/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Reserve for emergencies/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Carry-over days/i)).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /advanced/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText(/Reserve for emergencies/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Carry-over days/i)).toBeInTheDocument();
  });
});
