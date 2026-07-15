import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Dashboard } from '@/components/Dashboard';
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
    expect(screen.getByText('Leave efficiency')).toBeInTheDocument();
    expect(screen.getByText('Days off achieved')).toBeInTheDocument();
    expect(screen.getByText('Budget remaining')).toBeInTheDocument();
    // Efficiency readout is an "N×" multiplier.
    expect(screen.getByText(/×$/)).toBeInTheDocument();
  });

  it('renders the three chart cards', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('Leave allocation')).toBeInTheDocument();
    expect(screen.getByText(/Budget affordability/)).toBeInTheDocument();
    expect(screen.getByText(/Days off & leave spent by month/)).toBeInTheDocument();
  });
});
