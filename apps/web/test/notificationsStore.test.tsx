import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { NotificationsProvider, useNotifications } from '@/store/notifications';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NotificationsProvider>{children}</NotificationsProvider>
);
const setup = () => renderHook(() => useNotifications(), { wrapper });

describe('client notifications store', () => {
  it('emits an in-app notification to a recipient', () => {
    const { result } = setup();
    const before = result.current.forUser(2).length;
    act(() =>
      result.current.emit([
        { recipientUserId: 2, type: 'invite.created', subjectId: 'inv-a', ctx: { actorName: 'A', groupName: 'G' } },
      ]),
    );
    expect(result.current.forUser(2).length).toBe(before + 1);
  });

  it('is idempotent — the same (type, subject, recipient) never duplicates', () => {
    const { result } = setup();
    const emitOnce = () =>
      act(() =>
        result.current.emit([
          { recipientUserId: 2, type: 'invite.created', subjectId: 'inv-b', ctx: { groupName: 'G' } },
        ]),
      );
    emitOnce();
    const after = result.current.forUser(2).length;
    emitOnce();
    expect(result.current.forUser(2).length).toBe(after);
  });

  it('respects an in-app opt-out for a type', () => {
    const { result } = setup();
    act(() =>
      result.current.setPref({ userId: 2, overrides: { 'plan.shared': { inapp: false } }, muted: false }),
    );
    const before = result.current.forUser(2).length;
    act(() =>
      result.current.emit([
        { recipientUserId: 2, type: 'plan.shared', subjectId: 'sh-x', ctx: { planTitle: 'plan-1' } },
      ]),
    );
    expect(result.current.forUser(2).length).toBe(before); // suppressed
  });

  it('tracks unread and mark-read', () => {
    const { result } = setup();
    act(() =>
      result.current.emit([{ recipientUserId: 9, type: 'invite.created', subjectId: 's1', ctx: {} }]),
    );
    expect(result.current.unreadCount(9)).toBe(1);
    const id = result.current.forUser(9)[0].id;
    act(() => result.current.markRead(id));
    expect(result.current.unreadCount(9)).toBe(0);
  });
});
