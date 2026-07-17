import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreferencesPanel } from '@/components/PreferencesPanel';
import { renderWithProviders } from './utils';

describe('Travel preferences', () => {
  it('renders scope, flight-time, and countries-to-avoid controls', () => {
    renderWithProviders(<PreferencesPanel />);
    expect(screen.getByText('Travel preferences')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Domestic only' })).toBeInTheDocument();
    expect(screen.getByLabelText('Maximum flight time')).toBeInTheDocument();
  });

  it('lets the user restrict scope and avoid a country', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PreferencesPanel />);

    const domestic = screen.getByRole('button', { name: 'Domestic only' });
    expect(domestic).toHaveAttribute('aria-pressed', 'false');
    await user.click(domestic);
    expect(screen.getByRole('button', { name: 'Domestic only' })).toHaveAttribute('aria-pressed', 'true');

    // "Countries to avoid" includes seeded destination countries like Spain.
    const spain = screen.getByRole('button', { name: 'Spain' });
    await user.click(spain);
    expect(screen.getByRole('button', { name: 'Spain' })).toHaveAttribute('aria-pressed', 'true');
  });
});
