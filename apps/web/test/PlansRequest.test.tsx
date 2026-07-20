import { describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlansView } from '@/components/PlansView';
import { GroupView } from '@/components/GroupView';
import { useGroups } from '@/store/groups';
import { renderWithProviders } from './utils';

function DraftProbe() {
  const g = useGroups();
  return (
    <div data-testid="draft">
      {g.requestDraft ? `${g.requestDraft.start}..${g.requestDraft.end}` : 'none'}
    </div>
  );
}

describe('one-click request from a plan break', () => {
  it('stages the break dates and navigates to the group tab', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithProviders(
      <>
        <PlansView onNavigate={onNavigate} />
        <DraftProbe />
      </>,
    );

    // The default-selected plan (plan-1) shows per-break "Request" buttons.
    const requestButtons = screen.getAllByRole('button', { name: /^request$/i });
    expect(requestButtons.length).toBeGreaterThan(0);

    await user.click(requestButtons[0]);

    expect(onNavigate).toHaveBeenCalledWith('group');
    expect(screen.getByTestId('draft').textContent).toMatch(/^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/);
  });

  it('adopts the staged dates into the approval form for review', async () => {
    const user = userEvent.setup();

    function Harness() {
      const g = useGroups();
      return (
        <>
          <button type="button" onClick={() => g.setRequestDraft({ start: '2026-04-02', end: '2026-04-06' })}>
            stage
          </button>
          <GroupView />
        </>
      );
    }

    renderWithProviders(<Harness />);
    await user.click(screen.getByRole('button', { name: 'stage' }));

    await waitFor(() => {
      expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2026-04-02');
    });
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('2026-04-06');
    // Honest affordance: nothing is submitted for the user.
    expect(screen.getByText(/filled from your selected plan/i)).toBeInTheDocument();
  });
});
