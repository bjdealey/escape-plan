import { describe, expect, it } from 'vitest';
import {
  MAX_ATTEMPTS,
  NOTIFICATION_TYPES,
  backoffMs,
  batchDigest,
  dedupKey,
  defaultPreference,
  emptyPreference,
  escapeHtml,
  inQuietHours,
  isChannelEnabled,
  renderNotification,
  resolveDelivery,
  stripHeader,
  type NotificationPreference,
} from '../src/index.js';

describe('catalogue & defaults', () => {
  it('covers every event type with sensible channel defaults', () => {
    expect(NOTIFICATION_TYPES.length).toBeGreaterThanOrEqual(10);
    // In-app on everywhere; transactional email on; digests/nudges email off.
    for (const t of NOTIFICATION_TYPES) expect(defaultPreference(t, 'inapp')).toBe(true);
    expect(defaultPreference('leave.approved', 'email')).toBe(true);
    expect(defaultPreference('reminder.savings', 'email')).toBe(false);
    expect(defaultPreference('leave.requested', 'push')).toBe(false);
  });
});

describe('escaping & header-injection safety', () => {
  it('escapes HTML for email bodies', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml(`a"b'c&d`)).toBe('a&quot;b&#39;c&amp;d');
  });

  it('strips CR/LF (no header injection) but keeps normal punctuation', () => {
    expect(stripHeader('subject\r\nBcc: attacker@x.com')).not.toMatch(/[\r\n]/);
    expect(stripHeader('Rivera-Household (2026)')).toBe('Rivera-Household (2026)');
  });

  it('renders a header-safe title even from a malicious name', () => {
    const c = renderNotification('plan.shared', {
      actorName: 'Bad\r\nBcc: x@x.com',
      planTitle: '<b>Trip</b>',
    });
    expect(c.title).not.toMatch(/[\r\n]/);
  });
});

describe('content redaction (only supplied fields appear)', () => {
  it('a leave.rejected body includes the reason only when provided', () => {
    const withReason = renderNotification('leave.rejected', { start: '2026-06-01', end: '2026-06-05', reason: 'Capacity' });
    expect(withReason.body).toMatch(/Capacity/);
    const noReason = renderNotification('leave.rejected', { start: '2026-06-01', end: '2026-06-05' });
    expect(noReason.body).not.toMatch(/Reason/);
  });
});

describe('preferences resolution', () => {
  const pref: NotificationPreference = {
    userId: 1,
    overrides: { 'leave.approved': { email: false } },
    muted: false,
  };

  it('honours per-type per-channel overrides over defaults', () => {
    expect(isChannelEnabled(pref, 'leave.approved', 'email')).toBe(false);
    expect(isChannelEnabled(pref, 'leave.approved', 'inapp')).toBe(true);
    expect(isChannelEnabled(undefined, 'leave.approved', 'email')).toBe(true);
  });

  it('global mute disables everything', () => {
    expect(isChannelEnabled({ ...pref, muted: true }, 'leave.requested', 'inapp')).toBe(false);
  });

  it('quiet hours defer email/push but never in-app', () => {
    const quiet: NotificationPreference = { ...emptyPreference(2), quietHoursStart: 22 * 60, quietHoursEnd: 7 * 60 };
    expect(inQuietHours(quiet, 23 * 60)).toBe(true); // wrap-around window
    expect(inQuietHours(quiet, 12 * 60)).toBe(false);
    const d = resolveDelivery(quiet, 'leave.approved', 23 * 60);
    expect(d.inapp).toBe(true);
    expect(d.email).toBe('defer');
  });

  it('resolves to send outside quiet hours', () => {
    expect(resolveDelivery(undefined, 'leave.approved', 12 * 60).email).toBe('send');
    expect(resolveDelivery(undefined, 'reminder.savings', 12 * 60).email).toBe('off');
  });
});

describe('dedup, digest, backoff', () => {
  it('dedup keys are stable per (type, subject, recipient)', () => {
    expect(dedupKey('leave.approved', 'lr-1', 2)).toBe('leave.approved:lr-1:2');
  });

  it('batches multiple items into one digest', () => {
    const digest = batchDigest(
      3,
      [
        renderNotification('reminder.approval', { count: 2, groupName: 'Team' }),
        renderNotification('reminder.holiday', { days: 10 }),
      ],
      '2026-07-15',
    );
    expect(digest.recipientUserId).toBe(3);
    expect(digest.content.body.split('\n')).toHaveLength(2);
    expect(digest.dedupKey).toContain('2026-07-15');
  });

  it('backoff grows exponentially and dead-letters after MAX_ATTEMPTS', () => {
    expect(backoffMs(1)).toBeLessThan(backoffMs(3));
    expect(MAX_ATTEMPTS).toBe(5);
  });
});
