/**
 * The phone's X25519 identity. The private key lives in the Keychain with
 * AFTER_FIRST_UNLOCK, which is migratable: it moves to a new iPhone with Quick
 * Start or an encrypted-backup restore (owner decision 3), and is readable while
 * the app syncs in the background after first unlock. It never leaves the phone
 * otherwise. Only the public half is published.
 *
 * Identity is cached in memory per userId to avoid repeated network calls;
 * concurrent loads of the same identity are deduplicated by inflight map.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { saveJSON, StorageKeys } from '@/lib/storage';
import { supabase, TABLES } from '@/lib/supabase';

import { expoDeps } from './aes-expo';
import { fromB64, toB64 } from './bytes';
import { type Identity, identityFromSecret, newIdentity } from './envelope';
import type { PartnerTrust } from './partner-trust';

const OPTS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
const cache = new Map<string, Identity>();
const inflight = new Map<string, Promise<Identity>>();

export function loadOrCreateIdentity(userId: string): Promise<Identity> {
  const cached = cache.get(userId);
  if (cached) return Promise.resolve(cached);

  let p = inflight.get(userId);
  if (!p) {
    p = loadOrCreate(userId).finally(() => inflight.delete(userId));
    inflight.set(userId, p);
  }
  return p;
}

async function loadOrCreate(userId: string): Promise<Identity> {
  const key = `${StorageKeys.e2eeSecret}.${userId}`;
  const stored = await SecureStore.getItemAsync(key, OPTS);
  let identity: Identity;
  if (stored) {
    identity = identityFromSecret(fromB64(stored));
  } else {
    identity = newIdentity(expoDeps);
    await SecureStore.setItemAsync(key, toB64(identity.secretKey), OPTS);
  }
  cache.set(userId, identity);
  // Publish in background: offline means it publishes on a later load.
  void publishPublicKey(userId, toB64(identity.publicKey)).catch(() => {});
  return identity;
}

async function publishPublicKey(userId: string, publicKey: string): Promise<void> {
  const current = await fetchPublicKey(userId);
  if (current === publicKey) return;
  const { error } = await supabase.from(TABLES.profiles).update({ public_key: publicKey }).eq('id', userId);
  if (error) throw error;
}

/** `undefined` when the request failed (offline), `null` when there is no key. */
export async function fetchPublicKey(userId: string): Promise<string | null | undefined> {
  const { data, error } = await supabase.from(TABLES.profiles).select('public_key').eq('id', userId).maybeSingle();
  if (error) return undefined;
  return (data?.public_key as string | null | undefined) ?? null;
}

/**
 * Load partner trust, failing closed if the record is corrupt or unreadable.
 * Returning null indicates "first use" (no existing trust), so a corrupt or
 * unparseable record must throw rather than silently return null. This prevents
 * trusting a partner key the server now holds after a local key verification failure.
 */
export async function loadPartnerTrust(userId: string): Promise<PartnerTrust | null> {
  const key = `${StorageKeys.e2eePartner}.${userId}`;
  const raw = await AsyncStorage.getItem(key);
  if (raw === null) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('corrupt partner-trust record');
  }

  if (typeof data !== 'object' || data === null || !('key' in data) || !('verified' in data) ||
      typeof (data as Record<string, unknown>).key !== 'string' ||
      typeof (data as Record<string, unknown>).verified !== 'boolean') {
    throw new Error('corrupt partner-trust record');
  }

  return data as PartnerTrust;
}

export function savePartnerTrust(userId: string, trust: PartnerTrust | null): Promise<void> {
  return saveJSON(`${StorageKeys.e2eePartner}.${userId}`, trust);
}
