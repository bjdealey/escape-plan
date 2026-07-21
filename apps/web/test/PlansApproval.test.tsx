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
  it('shows an honest approval hint for a team member, with provenance and no fake %', async () => {
    // Default acting user (1) belongs to the Product Team.
    renderWithProviders(<PlansView />);

    // The accessible label names the real basis and disclaims being a probability.
    const labelled = await screen.findAllByLabelText(
      /based on .*real leave overlap and team capacity — not a probability/i,
    );
    expect(labelled.length).toBeGreaterThan(0);

    // No manufactured percentage is ever shown as an approval likelihood.
    expect(screen.queryByText(/% approval/)).not.toBeInTheDocument();
    expect(screen.queryByText(/% likely to be approved/)).not.toBeInTheDocument();
  });

  it('shows no approval hint for a user with no team (household-only)', async () => {
    // User 2 is only in the household, which auto-approves — no team signal.
    renderWithProviders(
      <ActingAs id={2}>
        <PlansView />
      </ActingAs>,
    );

    await waitFor(() => {
      expect(
        screen.queryByLabelText(/real leave overlap and team capacity/i),
      ).not.toBeInTheDocument();
    });
  });
});
