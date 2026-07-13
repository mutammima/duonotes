/**
 * Colors for the scheme currently in effect, with the chosen accent merged in
 * as `accent` (solid), `accentSoft` (translucent tint) and `onAccent` (text on
 * an accent fill). Respects the user's Appearance preferences.
 */

import { ACCENTS, Colors, hexToRgba } from '@/constants/theme';
import { useAccentKey, useThemeScheme } from '@/context/theme-context';

export function useTheme() {
  const scheme = useThemeScheme();
  const accentKey = useAccentKey();
  const accent = ACCENTS[accentKey];

  return {
    ...Colors[scheme],
    accent,
    accentSoft: hexToRgba(accent, scheme === 'dark' ? 0.22 : 0.14),
    onAccent: '#ffffff',
  };
}
