import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { PlansView } from '@/components/PlansView';
import { useGroups } from '@/store/groups';
import { renderWithProviders } from './utils';

/** Switch the acting user on mount so we can exercise team vs non-team paths. */
function ActingAs({ id, children }: { id: number; children: React.ReactNode }) {
  const g = useGroups();
  React.useEffect(() => {
    g.actAs(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{children}</>;
}

describe('PlansView approval likelihood', () => {
  it('shows an honest approval hint for a team member, with provenance', async () => {
    // Default acting user (1) belongs to the Product Team.
    renderWithProviders(<PlansView />);

    const hints = await screen.findAllByText(/% approval$/);
    expect(hints.length).toBeGreaterThan(0);

    // The accessible label names the real basis, never manufactured pressure.
    const labelled = screen.getAllByLabelText(
      /likely to be approved, based on .*real leave overlap and capacity/i,
    );
    expect(labelled.length).toBe(hints.length);
  });

  it('shows no approval hint for a user with no team (household-only)', async () => {
    // User 2 is only in the household, which auto-approves — no team signal.
    renderWithProviders(
      <ActingAs id={2}>
        <PlansView />
      </ActingAs>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/% approval$/)).not.toBeInTheDocument();
    });
  });
});
