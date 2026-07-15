import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  // jsdom under Node 26 may not expose a global localStorage; guard it.
  try {
    window.localStorage?.clear();
  } catch {
    /* ignore */
  }
});

// jsdom lacks these browser APIs that our components (Radix, Recharts) touch.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error jsdom polyfill
window.ResizeObserver = window.ResizeObserver ?? RO;
// @ts-expect-error jsdom polyfill
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
