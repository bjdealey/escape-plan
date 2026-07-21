import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { renderWithProviders } from './utils';

// Dashboard (the default Plan view) renders Recharts; stub the container so it
// mounts cleanly in jsdom, mirroring Dashboard.test.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 300 }}>{children}</div>
    ),
  };
});

describe('App navigation', () => {
  beforeEach(() => {
    localStorage.setItem('escape-plan-onboarded', 'true');
  });
  afterEach(() => localStorage.clear());

  it('collapses the top nav to the two core-job tabs, with the assistant floating', () => {
    renderWithProviders(<App />);
    const topNav = screen.getByRole('tablist', { name: 'Planner sections' });
    expect(within(topNav).getAllByRole('tab').map((t) => t.textContent?.trim())).toEqual([
      'Plan',
      'Group',
    ]);
    // Settings and the assistant are no longer top-level tabs.
    expect(screen.queryByRole('tab', { name: 'Alerts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Preferences' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Assistant' })).not.toBeInTheDocument();
    // The assistant is reachable from every screen as a floating button.
    expect(screen.getByRole('button', { name: 'Ask the assistant' })).toBeInTheDocument();
  });

  it('opens the floating assistant panel from its button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.click(screen.getByRole('button', { name: 'Ask the assistant' }));
    const dialog = screen.getByRole('dialog', { name: 'Escape Plan assistant' });
    expect(within(dialog).getByText('Ask Escape Plan')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close assistant' }));
    expect(screen.queryByRole('dialog', { name: 'Escape Plan assistant' })).not.toBeInTheDocument();
  });

  it('preserves the assistant conversation across close and reopen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.click(screen.getByRole('button', { name: 'Ask the assistant' }));
    const input = screen.getByLabelText('Ask a question about your plan');
    await user.type(input, 'remember this{Enter}');

    // The message is in the conversation log.
    const dialog = screen.getByRole('dialog', { name: 'Escape Plan assistant' });
    expect(within(dialog).getByText('remember this')).toBeInTheDocument();

    // Close, then reopen — the panel stays mounted, so the log survives.
    await user.click(within(dialog).getByRole('button', { name: 'Close assistant' }));
    expect(screen.queryByRole('dialog', { name: 'Escape Plan assistant' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ask the assistant' }));
    const reopened = screen.getByRole('dialog', { name: 'Escape Plan assistant' });
    expect(within(reopened).getByText('remember this')).toBeInTheDocument();
  });

  it('nests Dashboard, Calendar and Plans under the Plan tab', () => {
    renderWithProviders(<App />);
    const planViews = screen.getByRole('tablist', { name: 'Plan views' });
    expect(within(planViews).getAllByRole('tab').map((t) => t.textContent?.trim())).toEqual([
      'Dashboard',
      'Calendar',
      'Plans',
    ]);
  });

  it('opens Preferences from the header gear, with a route back to the plan', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.click(screen.getByRole('button', { name: 'Preferences' }));
    expect(await screen.findByText('What matters most?')).toBeInTheDocument();
    // The tab bar yields to the settings panel, which offers a way back.
    expect(screen.queryByRole('tablist', { name: 'Planner sections' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Back to plan/ }));
    expect(screen.getByRole('tablist', { name: 'Planner sections' })).toBeInTheDocument();
  });
});
