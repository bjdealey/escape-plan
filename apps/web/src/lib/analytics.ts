/**
 * Privacy-first, off-by-default event layer.
 *
 * Escape Plan's promise is that nothing leaves the device unless the user opts
 * in. So `track()` sends nothing by default: no network, no persistence, no
 * console noise. A host application wires a real destination (PostHog, Segment,
 * a first-party endpoint, …) by calling `setAnalyticsSink()` — an explicit,
 * auditable choice that never happens implicitly.
 *
 * Two on-device conveniences that honour the promise:
 *  - a small in-memory ring buffer (`getRecordedEvents`) so tests and a debug
 *    overlay can assert on the funnel without any external dependency;
 *  - `VITE_ANALYTICS_DEBUG=true` echoes events to `console.debug` for local dev.
 *
 * Nothing here decides *what* the funnel is — call sites do, by naming events.
 * This module only makes those events observable so each proposed change can be
 * validated against a real metric instead of a hunch.
 */

export interface AnalyticsEvent {
  /** Snake-case event name, e.g. `plan_selected`. */
  name: string;
  /** Optional non-PII properties describing the event. */
  props?: Record<string, unknown>;
  /** Epoch milliseconds the event was recorded. */
  ts: number;
}

export type AnalyticsSink = (event: AnalyticsEvent) => void;

const RING_SIZE = 100;
const ring: AnalyticsEvent[] = [];
let sink: AnalyticsSink | null = null;

function debugEnabled(): boolean {
  try {
    // `import.meta.env` is a Vite/Vitest construct; guard for other runtimes.
    return (
      (import.meta as unknown as { env?: Record<string, unknown> }).env
        ?.VITE_ANALYTICS_DEBUG === 'true'
    );
  } catch {
    return false;
  }
}

/**
 * Register (or clear, with `null`) the destination for tracked events. Until a
 * sink is set, events are recorded on-device only and go nowhere off-device.
 */
export function setAnalyticsSink(next: AnalyticsSink | null): void {
  sink = next;
}

/** Record a funnel event. Safe to call from anywhere; never throws. */
export function track(name: string, props?: Record<string, unknown>): void {
  const event: AnalyticsEvent = { name, props, ts: Date.now() };

  ring.push(event);
  if (ring.length > RING_SIZE) ring.shift();

  if (debugEnabled()) {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', name, props ?? {});
  }

  try {
    sink?.(event);
  } catch {
    /* A sink must never be able to break the app. */
  }
}

/** The most recent events (oldest first), for tests and debug overlays. */
export function getRecordedEvents(): readonly AnalyticsEvent[] {
  return ring;
}

/** Reset all module state. Intended for tests. */
export function __resetAnalytics(): void {
  ring.length = 0;
  sink = null;
}
