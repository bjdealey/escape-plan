import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreferencesPanel } from '@/components/PreferencesPanel';
import { PlansView } from '@/components/PlansView';
import { renderWithProviders } from './utils';

describe('Time off for anything (occasions)', () => {
  it('lists seeded occasions and can add one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PreferencesPanel />);
    expect(screen.getByText('Time off for anything')).toBeInTheDocument();
    // Demo seeds an anchored Anniversary and a House move.
    expect(screen.getByDisplayValue('Anniversary')).toBeInTheDocument();
    expect(screen.getByDisplayValue('House move')).toBeInTheDocument();

    const before = screen.getAllByLabelText(/^What for$/).length;
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getAllByLabelText(/^What for$/).length).toBe(before + 1);
  });

  it('lets a commitment be toggled off from booking', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PreferencesPanel />);
    const toggle = screen.getByRole('switch', { name: /Book time off around Anniversary/i });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(screen.getByRole('switch', { name: /Book time off around Anniversary/i })).not.toBeChecked();
  });
});

describe('anchored breaks surface in plans', () => {
  it('a plan shows non-travel time off around a personal date', () => {
    renderWithProviders(<PlansView />);
    // Every plan includes the anchored occasions from the demo.
    expect(screen.getAllByText(/Anniversary \(Occasion\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/House move \(Life admin\)/).length).toBeGreaterThan(0);
  });
});
