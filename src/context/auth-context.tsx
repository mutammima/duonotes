/**
 * Authentication state for DuoNotes.
 *
 * PLACEHOLDER BACKEND: accounts live on-device only. Passwords are salted +
 * SHA-256 hashed (never stored raw), and the session lives in SecureStore, but
 * there is no server, so two phones cannot yet see each other's accounts. Swap
 * the marked functions for calls to a real auth provider (Supabase, Firebase,
 * Clerk, or your own API) to make login + sharing work across devices.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { generateId, generateSalt, hashSecret, secretsMatch } from '@/lib/crypto';
import { loadJSON, loadSecret, saveJSON, saveSecret, deleteSecret, StorageKeys } from '@/lib/storage';
import type { User } from '@/lib/types';

interface StoredUser extends User {
  salt: string;
  passwordHash: string;
}

interface AuthContextValue {
  user: User | null;
  /** True until we have finished restoring any saved session. */
  initializing: boolean;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Restore an existing session on launch.
  useEffect(() => {
    (async () => {
      try {
        const sessionId = await loadSecret(StorageKeys.session);
        if (sessionId) {
          const users = await loadJSON<StoredUser[]>(StorageKeys.users, []);
          const found = users.find((u) => u.id === sessionId);
          if (found) setUser(toPublicUser(found));
        }
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!name.trim() || !normalizedEmail || password.length < 4) {
      throw new Error('Enter a name, a valid email, and a password of at least 4 characters.');
    }
    const users = await loadJSON<StoredUser[]>(StorageKeys.users, []);
    if (users.some((u) => u.email === normalizedEmail)) {
      throw new Error('An account with that email already exists on this device.');
    }
    const salt = await generateSalt();
    const newUser: StoredUser = {
      id: await generateId(),
      email: normalizedEmail,
      name: name.trim(),
      salt,
      passwordHash: await hashSecret(password, salt),
    };
    await saveJSON(StorageKeys.users, [...users, newUser]);
    await saveSecret(StorageKeys.session, newUser.id);
    setUser(toPublicUser(newUser));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const users = await loadJSON<StoredUser[]>(StorageKeys.users, []);
    const found = users.find((u) => u.email === normalizedEmail);
    if (!found) throw new Error('No account found for that email on this device.');
    const attempt = await hashSecret(password, found.salt);
    if (!secretsMatch(attempt, found.passwordHash)) {
      throw new Error('Incorrect password.');
    }
    await saveSecret(StorageKeys.session, found.id);
    setUser(toPublicUser(found));
  }, []);

  const signOut = useCallback(async () => {
    await deleteSecret(StorageKeys.session);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, initializing, signUp, signIn, signOut }),
    [user, initializing, signUp, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function toPublicUser(u: StoredUser): User {
  return { id: u.id, email: u.email, name: u.name };
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>.');
  return ctx;
}
