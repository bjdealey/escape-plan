import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
  // The demo is a fixed-2026 fixture but the planner now stamps the real date so
  // plans never propose days already gone. Pin the clock to early in the demo
  // year so both seeded anchors (14 Jun, 16 Oct) are still upcoming and the
  // showcase is deterministic regardless of when the suite runs.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-15T00:00:00Z'));
  });
  afterAll(() => vi.useRealTimers());

  it('a plan shows non-travel time off around a personal date', () => {
    renderWithProviders(<PlansView />);
    // Every plan includes the anchored occasions from the demo.
    expect(screen.getAllByText(/Anniversary \(Occasion\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/House move \(Life admin\)/).length).toBeGreaterThan(0);
  });
});

describe('plans respect the current date', () => {
  // Once "today" is past the anniversary (14 Jun) but before the house move
  // (16 Oct), no plan may anchor around the date that has already gone, while a
  // still-upcoming commitment is kept.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-01T00:00:00Z'));
  });
  afterAll(() => vi.useRealTimers());

  it('drops a commitment that has already passed but keeps upcoming ones', () => {
    renderWithProviders(<PlansView />);
    expect(screen.queryByText(/Anniversary \(Occasion\)/)).toBeNull();
    expect(screen.getAllByText(/House move \(Life admin\)/).length).toBeGreaterThan(0);
  });
});
