import { describe, expect, it } from 'vitest';
import {
  AuthorizationError,
  assertCan,
  can,
  canEditPlan,
  canViewPlan,
  colleaguesOffOn,
  computeApprovalLikelihood,
  isValidInviteToken,
  leaveVisibility,
  normaliseEmail,
  roleAtLeast,
} from '../src/index.js';

describe('permission matrix — deny by default', () => {
  it('a non-member (role null) can do nothing', () => {
    for (const action of [
      'group.view',
      'group.invite',
      'group.manageMembers',
      'group.delete',
      'leave.request',
      'leave.approve',
    ] as const) {
      expect(can(action, { groupType: 'team', actorRole: null })).toBe(false);
    }
  });

  it('team roles gate invite/manage/delete correctly', () => {
    const team = (role: 'owner' | 'admin' | 'approver' | 'member') =>
      ({ groupType: 'team', actorRole: role }) as const;
    expect(can('group.invite', team('member'))).toBe(false);
    expect(can('group.invite', team('admin'))).toBe(true);
    expect(can('group.manageMembers', team('approver'))).toBe(false);
    expect(can('group.manageMembers', team('admin'))).toBe(true);
    expect(can('group.delete', team('admin'))).toBe(false);
    expect(can('group.delete', team('owner'))).toBe(true);
  });

  it('households are peer groups: any member may invite', () => {
    expect(can('group.invite', { groupType: 'household', actorRole: 'member' })).toBe(true);
  });

  it('leave.approve requires approver+ in teams and never self', () => {
    expect(can('leave.approve', { groupType: 'team', actorRole: 'member' })).toBe(false);
    expect(can('leave.approve', { groupType: 'team', actorRole: 'approver' })).toBe(true);
    expect(can('leave.approve', { groupType: 'team', actorRole: 'owner', isSelf: true })).toBe(false);
    // households: any member acknowledges, but not their own request
    expect(can('leave.approve', { groupType: 'household', actorRole: 'member' })).toBe(true);
    expect(can('leave.approve', { groupType: 'household', actorRole: 'member', isSelf: true })).toBe(false);
  });

  it('roleAtLeast respects the rank order', () => {
    expect(roleAtLeast('owner', 'admin')).toBe(true);
    expect(roleAtLeast('member', 'approver')).toBe(false);
  });

  it('assertCan throws AuthorizationError when denied', () => {
    expect(() => assertCan('group.delete', { groupType: 'team', actorRole: 'member' })).toThrow(
      AuthorizationError,
    );
  });
});

describe('plan sharing', () => {
  const share = { ownerUserId: 1, groupId: 'g-house', level: 'coedit' as const };
  it('owner can view and edit', () => {
    expect(canViewPlan(share, { userId: 1, groupIds: [] })).toBe(true);
    expect(canEditPlan(share, { userId: 1, groupIds: [] })).toBe(true);
  });
  it('group member can view; can edit only when coedit', () => {
    expect(canViewPlan(share, { userId: 2, groupIds: ['g-house'] })).toBe(true);
    expect(canEditPlan(share, { userId: 2, groupIds: ['g-house'] })).toBe(true);
    const viewOnly = { ...share, level: 'view' as const };
    expect(canEditPlan(viewOnly, { userId: 2, groupIds: ['g-house'] })).toBe(false);
  });
  it('a non-member is denied', () => {
    expect(canViewPlan(share, { userId: 9, groupIds: ['other'] })).toBe(false);
    expect(canEditPlan(share, { userId: 9, groupIds: ['other'] })).toBe(false);
  });
});

describe('privacy visibility', () => {
  it('self always sees full; others see per setting', () => {
    expect(leaveVisibility('private', true)).toBe('full');
    expect(leaveVisibility('full', false)).toBe('full');
    expect(leaveVisibility('busy', false)).toBe('busy');
    expect(leaveVisibility('private', false)).toBe('hidden');
  });
});

describe('approval likelihood (derived, not stub)', () => {
  it('is near-zero in a blackout', () => {
    expect(computeApprovalLikelihood({ overlapColleagues: 0, maxSimultaneous: 2, inBlackout: true })).toBeLessThan(0.1);
  });
  it('is low when capacity is already full', () => {
    expect(computeApprovalLikelihood({ overlapColleagues: 2, maxSimultaneous: 2, inBlackout: false })).toBeLessThanOrEqual(0.2);
  });
  it('is high when capacity is free, and deterministic', () => {
    const a = computeApprovalLikelihood({ overlapColleagues: 0, maxSimultaneous: 2, inBlackout: false });
    const b = computeApprovalLikelihood({ overlapColleagues: 0, maxSimultaneous: 2, inBlackout: false });
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0.8);
  });
});

describe('untrusted input helpers', () => {
  it('validates and normalises emails', () => {
    expect(normaliseEmail('  Alex@Example.COM ')).toBe('alex@example.com');
    expect(normaliseEmail('not-an-email')).toBeNull();
    expect(normaliseEmail(42)).toBeNull();
  });
  it('validates invite token shape only', () => {
    expect(isValidInviteToken('a'.repeat(32))).toBe(true);
    expect(isValidInviteToken('short')).toBe(false);
    expect(isValidInviteToken(123)).toBe(false);
  });
  it('counts colleagues off on a date', () => {
    const abs = [
      { start: '2026-06-01', end: '2026-06-05' },
      { start: '2026-06-03', end: '2026-06-10' },
    ];
    expect(colleaguesOffOn(abs, '2026-06-04')).toBe(2);
    expect(colleaguesOffOn(abs, '2026-06-09')).toBe(1);
    expect(colleaguesOffOn(abs, '2026-07-01')).toBe(0);
  });
});
