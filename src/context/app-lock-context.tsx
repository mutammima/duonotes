/**
 * The "lock the whole app" preference. Kept in a context (not just read
 * ad-hoc) so toggling it in Settings updates the AppLockGate immediately,
 * mirroring how ThemePreferenceProvider works.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { isAppLockEnabled, setAppLockEnabled } from '@/lib/security';

interface AppLockContextValue {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    isAppLockEnabled().then(setEnabledState);
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    setAppLockEnabled(next).catch(() => {});
  }, []);

  return <AppLockContext.Provider value={{ enabled, setEnabled }}>{children}</AppLockContext.Provider>;
}

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error('useAppLock must be used within an <AppLockProvider>.');
  return ctx;
}
