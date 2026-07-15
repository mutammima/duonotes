/**
 * Authentication state for DuoNotes, backed by Supabase Auth.
 *
 * Sessions persist across app launches (SecureStore-free AsyncStorage adapter,
 * configured in `lib/supabase.ts`). The user's `profiles` row — including the
 * linked partner — is loaded alongside the session.
 */

import type { User as SupabaseUser } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { RPC, supabase, TABLES } from '@/lib/supabase';
import { loadJSON, saveJSON, StorageKeys } from '@/lib/storage';
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
  /** Change the display name shown on shared notes and in greetings. */
  updateName: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Ensure a profile row exists for this auth user (we have no auth.users
  // trigger, to avoid touching other apps in the same project), then return it.
  // The resolved profile is cached so a previously-signed-in user can restore
  // their session offline; if the network calls fail we fall back to that cache.
  const syncProfile = useCallback(async (sUser: SupabaseUser): Promise<User | null> => {
    const cacheKey = `${StorageKeys.profile}.${sUser.id}`;
    const fallbackName = (sUser.user_metadata?.name as string | undefined) ?? sUser.email?.split('@')[0] ?? 'Me';
    try {
      await supabase
        .from(TABLES.profiles)
        .upsert(
          { id: sUser.id, email: sUser.email, name: fallbackName },
          { onConflict: 'id', ignoreDuplicates: true },
        );
      const { data, error } = await supabase
        .from(TABLES.profiles)
        .select('id, email, name, partner_id')
        .eq('id', sUser.id)
        .single();
      if (error || !data) throw error ?? new Error('profile not found');
      const profile: User = { id: data.id, email: data.email, name: data.name, partnerId: data.partner_id };
      await saveJSON(cacheKey, profile);
      return profile;
    } catch {
      // Offline (or a transient error): keep the user signed in using the last
      // cached profile, or a minimal one built from the session itself.
      const cached = await loadJSON<User | null>(cacheKey, null);
      if (cached) return cached;
      return { id: sUser.id, email: sUser.email ?? '', name: fallbackName, partnerId: null };
    }
  }, []);

  // Restore any existing session, then react to future auth changes.
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session) setUser(await syncProfile(data.session.user));
      setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      setUser(session ? await syncProfile(session.user) : null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [syncProfile]);

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
    if (data.user) setUser(await syncProfile(data.user));
  }, [syncProfile]);

  const linkPartner = useCallback(
    async (email: string) => {
      const { error } = await supabase.rpc(RPC.linkPartner, { partner_email: email });
      if (error) throw new Error(error.message);
      await refreshProfile();
    },
    [refreshProfile],
  );

  const updateName = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Please enter a name.');
      if (!user) return;
      const { error } = await supabase.from(TABLES.profiles).update({ name: trimmed }).eq('id', user.id);
      if (error) throw new Error(error.message);
      const next = { ...user, name: trimmed };
      setUser(next);
      await saveJSON(`${StorageKeys.profile}.${user.id}`, next);
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, initializing, signUp, signIn, signOut, linkPartner, refreshProfile, updateName }),
    [user, initializing, signUp, signIn, signOut, linkPartner, refreshProfile, updateName],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>.');
  return ctx;
}
