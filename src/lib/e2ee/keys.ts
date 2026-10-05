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
import { type PartnerTrust, parsePartnerTrust } from './partner-trust';

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
  // Publish in background: offline means `ensurePublished` retries it on a later sync.
  void ensurePublished(userId).catch(() => {});
  return identity;
}

/** `${userId}:${publicKey}` once the server is confirmed to hold this phone's public key. */
const published = new Set<string>();

/**
 * Make sure the server holds this phone's public key for `userId`, once per
 * identity: a no-op after the first confirmed publish, retried by every sync
 * until then. Throws when it can't confirm (offline, or the update matched no row).
 */
export async function ensurePublished(userId: string): Promise<void> {
  const identity = cache.get(userId);
  if (!identity) return; // the identity isn't loaded yet; loading it publishes
  const publicKey = toB64(identity.publicKey);
  const tag = `${userId}:${publicKey}`;
  if (published.has(tag)) return;
  await publishPublicKey(userId, publicKey);
  published.add(tag);
}

async function publishPublicKey(userId: string, publicKey: string): Promise<void> {
  const current = await fetchPublicKey(userId);
  if (current === publicKey) return;
  const { data, error } = await supabase
    .from(TABLES.profiles)
    .update({ public_key: publicKey })
    .eq('id', userId)
    .select('id');
  if (error) throw error;
  // RLS or a missing profile row makes an update match nothing without an error.
  if (!data || data.length === 0) throw new Error('public key not published');
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
  return parsePartnerTrust(await AsyncStorage.getItem(`${StorageKeys.e2eePartner}.${userId}`));
}

export function savePartnerTrust(userId: string, trust: PartnerTrust | null): Promise<void> {
  return saveJSON(`${StorageKeys.e2eePartner}.${userId}`, trust);
}
