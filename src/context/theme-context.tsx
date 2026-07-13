/**
 * Appearance preferences: light/dark/system scheme + accent palette, persisted
 * on-device. The resolved scheme drives `useTheme()` colors and the navigation
 * theme; the accent is merged into `useTheme()` as `accent` / `accentSoft`.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { type AccentKey } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadJSON, saveJSON, StorageKeys } from '@/lib/storage';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ColorScheme = 'light' | 'dark';

interface ThemeContextValue {
  preference: ThemePreference;
  scheme: ColorScheme;
  accent: AccentKey;
  setPreference: (preference: ThemePreference) => void;
  setAccent: (accent: AccentKey) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');
  const [accent, setAcc] = useState<AccentKey>('rose');

  useEffect(() => {
    loadJSON<ThemePreference>(StorageKeys.themePreference, 'system').then(setPref);
    loadJSON<AccentKey>(StorageKeys.accentPreference, 'rose').then(setAcc);
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPref(next);
    void saveJSON(StorageKeys.themePreference, next);
  };
  const setAccent = (next: AccentKey) => {
    setAcc(next);
    void saveJSON(StorageKeys.accentPreference, next);
  };

  const scheme: ColorScheme =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo(
    () => ({ preference, scheme, accent, setPreference, setAccent }),
    [preference, scheme, accent],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Full appearance API — for the Settings switchers. */
export function useThemePreference(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemePreference must be used within a <ThemePreferenceProvider>.');
  return ctx;
}

/** The scheme in effect. Falls back to the OS scheme outside the provider. */
export function useThemeScheme(): ColorScheme {
  const ctx = useContext(ThemeContext);
  const system = useColorScheme();
  if (ctx) return ctx.scheme;
  return system === 'dark' ? 'dark' : 'light';
}

/** The accent key in effect. Falls back to rose outside the provider. */
export function useAccentKey(): AccentKey {
  return useContext(ThemeContext)?.accent ?? 'rose';
}
