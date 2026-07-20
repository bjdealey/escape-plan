import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from '@/components/Dashboard';
import { AiPlanner } from '@/components/AiPlanner';
import { renderWithProviders } from './utils';

describe('Assistant nudge', () => {
  it('offers engine-answerable prompts on the dashboard and calls onAsk', async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();
    renderWithProviders(<Dashboard onAsk={onAsk} />);

    const nudge = screen.getByText(/ask the assistant/i).closest('div') as HTMLElement;
    const prompts = within(nudge).getAllByRole('button');
    expect(prompts.length).toBeGreaterThan(0);

    await user.click(prompts[0]);
    expect(onAsk).toHaveBeenCalledWith(prompts[0].textContent);
  });

  it('does not render the nudge when no handler is provided', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.queryByText(/ask the assistant/i)).not.toBeInTheDocument();
  });

  it('asks a seeded question once on open and reports it consumed', async () => {
    const onConsumed = vi.fn();
    renderWithProviders(
      <AiPlanner seedQuestion="What if I buy five extra leave days?" onSeedConsumed={onConsumed} />,
    );

    // The seeded question appears as a user message inside the conversation log
    // (distinct from the same text offered as a suggested-question button).
    const log = screen.getByRole('log');
    expect(
      await within(log).findByText('What if I buy five extra leave days?'),
    ).toBeInTheDocument();
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });
});
