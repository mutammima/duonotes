/**
 * Color tokens for light and dark mode, plus the selectable accent palettes.
 * Neutrals are gently warmed for a friendlier, less clinical feel.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1A1618',
    background: '#FFFCFB',
    backgroundElement: '#F6F1EF',
    backgroundSelected: '#ECE4E1',
    textSecondary: '#6B646A',
  },
  dark: {
    text: '#FBF7F6',
    background: '#0E0C0D',
    backgroundElement: '#1E1A1C',
    backgroundSelected: '#2B2528',
    textSecondary: '#B4ABAF',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Selectable accent palettes (chosen in Settings → Appearance). */
export const ACCENTS = {
  rose: '#E6488E',
  coral: '#FB7185',
  lavender: '#9B7EDE',
  blue: '#3C87F7',
} as const;

export type AccentKey = keyof typeof ACCENTS;

export const ACCENT_LABELS: Record<AccentKey, string> = {
  rose: 'Rose',
  coral: 'Coral',
  lavender: 'Lavender',
  blue: 'Blue',
};

/** Translucent tint of a hex color — used for soft accent backgrounds/badges. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
