import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * True once you've added EXPO_PUBLIC_SUPABASE_URL and
 * EXPO_PUBLIC_SUPABASE_ANON_KEY to your `.env` (see `.env.example`). The app
 * shows a friendly setup screen until this is true instead of crashing.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

// DuoNotes tables live in the `public` schema but are prefixed with `duonotes_`
// so this app can share a Supabase project with other apps without colliding.
export const TABLES = {
  profiles: 'duonotes_profiles',
  notes: 'duonotes_notes',
} as const;

export const RPC = {
  linkPartner: 'duonotes_link_partner',
} as const;

// During web static rendering (`web.output: "static"` in app.json) the app is
// pre-rendered in Node, where there is no `window` and AsyncStorage's
// localStorage backend throws `window is not defined`. There's no user session
// on the server anyway, so fall back to an in-memory store there; the browser
// re-hydrates from real storage on mount.
const memoryStore = new Map<string, string>();
const serverStorage = {
  getItem: (key: string) => Promise.resolve(memoryStore.get(key) ?? null),
  setItem: (key: string, value: string) => {
    memoryStore.set(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    memoryStore.delete(key);
    return Promise.resolve();
  },
};

const authStorage =
  Platform.OS === 'web' && typeof window === 'undefined' ? serverStorage : AsyncStorage;

// The anon (public) key is safe to ship in a client app — access is governed by
// the Row-Level Security policies in `supabase/schema.sql`, not by hiding it.
export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder', {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Keep the auth token fresh only while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
