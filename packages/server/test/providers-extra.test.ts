import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSession } from '../src/providers/auth.js';
import { createGoogleCalendar } from '../src/providers/calendar.js';

function fakeResponse(json: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => json } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AUTH_PROVIDER;
});

describe('auth seam', () => {
  it('returns a local dev session by default', () => {
    const s = getSession();
    expect(s.provider).toBe('local-dev');
    expect(s.email).toBe('demo@escape-plan.app');
  });

  it('falls back to the dev user but records the configured provider', () => {
    process.env.AUTH_PROVIDER = 'authjs';
    expect(getSession().provider).toBe('authjs');
  });
});

describe('Google Calendar adapter (documented contract)', () => {
  it('maps free/busy ranges to date-only labels', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        fakeResponse({
          calendars: { primary: { busy: [{ start: '2026-05-01T09:00:00Z', end: '2026-05-03T17:00:00Z' }] } },
        }),
      ),
    );
    const ranges = await createGoogleCalendar('tok').busyRanges(1);
    expect(ranges).toEqual([{ start: '2026-05-01', end: '2026-05-03', label: 'Busy (calendar)' }]);
  });

  it('creates an event and returns its id/status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ id: 'evt123', status: 'confirmed' })));
    const created = await createGoogleCalendar('tok').createEvent!(1, {
      title: 'Annual leave',
      start: '2026-08-03',
      end: '2026-08-07',
    });
    expect(created).toEqual({ id: 'evt123', status: 'confirmed' });
  });

  it('validates the event before any network write-back', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(
      createGoogleCalendar('tok').createEvent!(1, { title: '', start: 'bad', end: 'bad' }),
    ).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
