import * as React from 'react';
import { useTheme } from '@/store/theme';

const TOKENS = [
  'primary',
  'accent',
  'success',
  'warning',
  'destructive',
  'muted-foreground',
  'foreground',
  'border',
] as const;

type Token = (typeof TOKENS)[number];

/**
 * Resolve theme CSS variables into concrete `hsl(...)` strings that SVG-based
 * charts (Recharts) can consume. Recomputes when the theme flips.
 */
export function useThemeColors(): Record<Token, string> {
  const { theme } = useTheme();
  return React.useMemo(() => {
    const styles = getComputedStyle(document.documentElement);
    const out = {} as Record<Token, string>;
    for (const token of TOKENS) {
      const raw = styles.getPropertyValue(`--${token}`).trim();
      out[token] = raw ? `hsl(${raw})` : '#888';
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
}
