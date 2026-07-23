import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationCenter } from '@/components/NotificationCenter';
import { NotificationPreferences } from '@/components/NotificationPreferences';
import { renderWithProviders } from './utils';

describe('NotificationCenter', () => {
  it('shows an unread badge and opens the feed with deep links', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithProviders(<NotificationCenter onNavigate={onNavigate} />);

    // Demo user (1) has a seeded unread "leave.approved".
    const bell = screen.getByRole('button', { name: /Notifications, \d+ unread/i });
    expect(bell).toBeInTheDocument();

    await user.click(bell);
    const item = screen.getByText('Leave approved');
    expect(item).toBeInTheDocument();

    await user.click(item);
    expect(onNavigate).toHaveBeenCalledWith('group');
  });
});

describe('NotificationPreferences', () => {
  it('renders per-type per-channel toggles and reflects a change', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationPreferences />);
    expect(screen.getByText('Notification preferences')).toBeInTheDocument();

    // "Leave approved — Email" defaults on; toggling flips it off.
    const toggle = screen.getByRole('switch', { name: /Leave approved — Email/i });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(screen.getByRole('switch', { name: /Leave approved — Email/i })).not.toBeChecked();
  });

  it('never auto-prompts for push (opt-in button present)', () => {
    renderWithProviders(<NotificationPreferences />);
    expect(screen.getByRole('button', { name: /Enable browser push|Push enabled|Not supported|Blocked/i })).toBeInTheDocument();
  });

  it('toggling the unread badge preference hides the bell badge', async () => {
    const user = userEvent.setup();
    // Both the preferences toggle and the bell share the same provider.
    renderWithProviders(
      <>
        <NotificationCenter onNavigate={vi.fn()} />
        <NotificationPreferences />
      </>,
    );

    // Demo user (1) has a seeded unread item, so the badge shows by default.
    expect(screen.getByText('1')).toBeInTheDocument();

    const badgeToggle = screen.getByRole('switch', { name: /Show unread badge count/i });
    expect(badgeToggle).toBeChecked();
    await user.click(badgeToggle);

    expect(screen.getByRole('switch', { name: /Show unread badge count/i })).not.toBeChecked();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });
});
