import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupView } from '@/components/GroupView';
import { renderWithProviders } from './utils';

describe('GroupView', () => {
  it('renders the selected group with members and their roles', () => {
    renderWithProviders(<GroupView />);
    expect(screen.getByRole('heading', { name: 'Members' })).toBeInTheDocument();
    // Default acting user (1) is a member of g-team, which includes Priya (owner).
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getAllByText('owner').length).toBeGreaterThan(0);
  });

  it('hides the invite form when the actor lacks permission', () => {
    renderWithProviders(<GroupView />);
    // User 1 is a plain member of the team → cannot invite.
    expect(
      screen.getByText(/don’t have permission to invite/i),
    ).toBeInTheDocument();
  });

  it('lets a member request leave, which appears as pending', async () => {
    const user = userEvent.setup();
    renderWithProviders(<GroupView />);
    // Default request dates are 2026-10-05..09; submit as user 1 in the team.
    await user.click(screen.getByRole('button', { name: 'Request' }));
    // A new pending request for those dates appears.
    expect(screen.getAllByText(/5 Oct/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('pending').length).toBeGreaterThan(0);
  });

  it('shows the approval-likelihood readout derived from group data', () => {
    renderWithProviders(<GroupView />);
    expect(screen.getByText(/Approval likelihood/i)).toBeInTheDocument();
  });
});
