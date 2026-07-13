/**
 * Authentication state for DuoNotes, backed by Supabase Auth.
 *
 * Sessions persist across app launches (SecureStore-free AsyncStorage adapter,
 * configured in `lib/supabase.ts`). The user's `profiles` row — including the
 * linked partner — is loaded alongside the session.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { User } from '@/lib/types';

interface AuthContextValue {
  user: User | null;
  /** True until we have finished restoring any saved session. */
  initializing: boolean;
  /** Returns whether the account still needs email confirmation before sign-in. */
  signUp: (name: string, email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Link the partner's account by their email (both directions). */
  linkPartner: (email: string) => Promise<void>;
  /** Re-read the current profile (e.g. after linking a partner). */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  const loadProfile = useCallback(async (userId: string): Promise<User | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, name, partner_id')
      .eq('id', userId)
      .single();
    if (error || !data) return null;
    return { id: data.id, email: data.email, name: data.name, partnerId: data.partner_id };
  }, []);

  // Restore any existing session, then react to future auth changes.
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session) setUser(await loadProfile(data.session.user.id));
      setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      setUser(session ? await loadProfile(session.user.id) : null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    if (!name.trim()) throw new Error('Please enter your name.');
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { name: name.trim() } },
    });
    if (error) throw new Error(error.message);
    // If a session came back, onAuthStateChange signs us in. If not, email
    // confirmation is enabled and the user must confirm before signing in.
    return { needsConfirmation: !data.session };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) setUser(await loadProfile(data.user.id));
  }, [loadProfile]);

  const linkPartner = useCallback(
    async (email: string) => {
      const { error } = await supabase.rpc('link_partner', { partner_email: email });
      if (error) throw new Error(error.message);
      await refreshProfile();
    },
    [refreshProfile],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, initializing, signUp, signIn, signOut, linkPartner, refreshProfile }),
    [user, initializing, signUp, signIn, signOut, linkPartner, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>.');
  return ctx;
}
