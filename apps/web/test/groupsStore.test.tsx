import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { AuthorizationError } from '@escape-plan/engine';
import { GroupsProvider, useGroups } from '@/store/groups';
import { NotificationsProvider } from '@/store/notifications';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NotificationsProvider>
    <GroupsProvider>{children}</GroupsProvider>
  </NotificationsProvider>
);

function setup() {
  return renderHook(() => useGroups(), { wrapper });
}

describe('client group store — deny by default', () => {
  it('a team member cannot invite; the owner can', () => {
    const { result } = setup();
    // Default actor is user 1 (member of g-team).
    expect(result.current.can('group.invite', 'g-team')).toBe(false);
    expect(() => result.current.invite('g-team', 'x@y.com')).toThrow(AuthorizationError);

    act(() => result.current.actAs(3)); // Priya, owner of g-team
    expect(result.current.can('group.invite', 'g-team')).toBe(true);
    act(() => result.current.invite('g-team', 'new@example.com'));
    expect(result.current.invitesFor('g-team').some((i) => i.email === 'new@example.com')).toBe(true);
  });

  it('a member cannot approve; nobody approves their own; an approver can', () => {
    const { result } = setup();
    // lr-1 is user 1's own pending request.
    expect(() => result.current.decideLeave('lr-1', 'approved')).toThrow(AuthorizationError);

    act(() => result.current.actAs(4)); // Marcus, plain member
    expect(() => result.current.decideLeave('lr-1', 'approved')).toThrow(AuthorizationError);

    act(() => result.current.actAs(5)); // Sofia, approver
    act(() => result.current.decideLeave('lr-1', 'approved'));
    const lr1 = result.current.requestsFor('g-team').find((r) => r.id === 'lr-1');
    expect(lr1?.state).toBe('approved');
    expect(lr1?.decidedBy).toBe(5);
  });

  it('household leave requests auto-approve', () => {
    const { result } = setup();
    act(() => result.current.actAs(2)); // Sam in household g-house
    act(() => result.current.requestLeave('g-house', '2026-09-01', '2026-09-03'));
    const mine = result.current.requestsFor('g-house').filter((r) => r.userId === 2);
    expect(mine.some((r) => r.state === 'approved')).toBe(true);
  });

  it('invite acceptance adds membership; expiry and revoke enforced', () => {
    const { result } = setup();
    // Owner invites Sam by email.
    act(() => result.current.actAs(3));
    act(() => result.current.invite('g-team', 'sam@escape-plan.app'));
    const token = result.current.invitesFor('g-team').find((i) => i.email === 'sam@escape-plan.app')!.token;

    act(() => result.current.actAs(2)); // Sam
    expect(result.current.roleIn('g-team')).toBeNull();
    act(() => result.current.acceptInvite(token));
    expect(result.current.roleIn('g-team')).toBe('member');
  });

  it('only the plan owner can revoke a share', () => {
    const { result } = setup();
    act(() => result.current.actAs(4)); // not the owner of sh-1 (owned by user 1)
    expect(() => result.current.revokeShare('sh-1')).toThrow(AuthorizationError);
  });

  it('a member gets view/edit on a coedit-shared plan; a non-member gets none', () => {
    const { result } = setup();
    act(() => result.current.actAs(2)); // g-house member (plan-1 shared coedit to g-house)
    expect(result.current.planAccess('plan-1')).toMatchObject({ canView: true, canEdit: true });
    act(() => result.current.actAs(4)); // g-team only
    expect(result.current.planAccess('plan-1')).toMatchObject({ level: 'none' });
  });
});
