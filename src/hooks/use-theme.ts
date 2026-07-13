/**
 * Colors for the scheme currently in effect (respecting the user's
 * Light / Dark / System preference from ThemePreferenceProvider).
 */

import { Colors } from '@/constants/theme';
import { useThemeScheme } from '@/context/theme-context';

export function useTheme() {
  return Colors[useThemeScheme()];
}
