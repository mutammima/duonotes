/**
 * Theme preference: Light / Dark / System, persisted on-device.
 *
 * `system` follows the OS setting; `light`/`dark` force a scheme. The resolved
 * scheme drives `useTheme()` (colors) and the navigation theme in `_layout`.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadJSON, saveJSON, StorageKeys } from '@/lib/storage';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ColorScheme = 'light' | 'dark';

interface ThemeContextValue {
  /** What the user picked. */
  preference: ThemePreference;
  /** The scheme actually in effect (system resolved to light/dark). */
  scheme: ColorScheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');

  // Restore the saved preference on launch.
  useEffect(() => {
    loadJSON<ThemePreference>(StorageKeys.themePreference, 'system').then(setPref);
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPref(next);
    void saveJSON(StorageKeys.themePreference, next);
  };

  const scheme: ColorScheme =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo(() => ({ preference, scheme, setPreference }), [preference, scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Full preference API — for the Settings switcher. */
export function useThemePreference(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemePreference must be used within a <ThemePreferenceProvider>.');
  return ctx;
}

/** The scheme in effect. Falls back to the OS scheme if used outside the
 *  provider, so nothing crashes before it mounts. */
export function useThemeScheme(): ColorScheme {
  const ctx = useContext(ThemeContext);
  const system = useColorScheme();
  if (ctx) return ctx.scheme;
  return system === 'dark' ? 'dark' : 'light';
}
