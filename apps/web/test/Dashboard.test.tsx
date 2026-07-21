import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from '@/components/Dashboard';
import { getRecordedEvents } from '@/lib/analytics';
import { renderWithProviders } from './utils';

// Recharts' ResponsiveContainer needs real dimensions; stub them so charts
// render in jsdom without warnings.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 300 }}>{children}</div>
    ),
  };
});

describe('Dashboard', () => {
  it('renders the key leave and efficiency readouts', () => {
    renderWithProviders(<Dashboard />);
    // "Leave efficiency" appears on both the stat card and the sharpened readout.
    expect(screen.getAllByText('Leave efficiency').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Days off achieved')).toBeInTheDocument();
    expect(screen.getByText('Budget remaining')).toBeInTheDocument();
    expect(screen.getByText('Savings progress')).toBeInTheDocument();
    // Efficiency readout is an "N×" multiplier.
    expect(screen.getAllByText(/×$/).length).toBeGreaterThanOrEqual(1);
  });

  it('leads with a hero headline of the selected plan and a route to act on it', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithProviders(<Dashboard onNavigate={onNavigate} />);

    // The "aha" — many days off from few leave days — is a headline, not a subtitle.
    const heading = screen.getByRole('heading', { name: /days off from just/ });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('Your plan')).toBeInTheDocument();

    // The primary CTA jumps to Plans (where breaks can be requested) and is tracked.
    await user.click(screen.getByRole('button', { name: /View & request breaks/ }));
    expect(onNavigate).toHaveBeenCalledWith('plans');
    expect(getRecordedEvents().some((e) => e.name === 'hero_view_plan_clicked')).toBe(true);
  });

  it('trims the tile row to four and drops the vanity / hero-duplicated tiles', () => {
    renderWithProviders(<Dashboard />);
    // Kept: two outcomes + two resources. ("Leave efficiency" also titles a
    // detail card below, so assert presence rather than uniqueness.)
    for (const label of ['Remaining leave', 'Days off achieved', 'Leave efficiency', 'Budget remaining']) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
    // Dropped: vanity or now shown in the hero above.
    for (const label of ['Warmest trip', 'Trips planned', 'Next escape', 'Longest break']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('renders the three chart cards', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('Leave allocation')).toBeInTheDocument();
    expect(screen.getByText(/Budget affordability/)).toBeInTheDocument();
    expect(screen.getByText(/Days off & leave spent by month/)).toBeInTheDocument();
  });
});
