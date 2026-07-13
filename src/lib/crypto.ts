/**
 * Security helpers for DuoNotes.
 *
 * What is implemented here (real):
 *   - PIN hashing with a random per-install salt using SHA-256 (expo-crypto).
 *     The raw PIN is never stored; only salt + hash live in SecureStore.
 *   - Cryptographically-strong id / salt generation.
 *
 * What is NOT yet implemented (placeholder — do not oversell to users):
 *   - At-rest AES-GCM encryption of note bodies. Right now a locked note's
 *     content is *gated* behind a PIN/biometric challenge in the UI and stored
 *     in the OS keychain-backed SecureStore, but the note body itself is not
 *     yet encrypted with a key derived from the PIN. `encryptBody` /
 *     `decryptBody` below are the seam where that belongs. See README.
 */

import * as Crypto from 'expo-crypto';

export async function generateId(): Promise<string> {
  const bytes = Crypto.getRandomBytes(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function generateSalt(): Promise<string> {
  return generateId();
}

/** Hash a PIN (or password) with a salt. Returns a hex digest. */
export async function hashSecret(secret: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${secret}`);
}

/**
 * Constant-time-ish comparison of two hex digests. Not a substitute for a real
 * constant-time compare, but avoids the most obvious early-exit leak.
 */
export function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * TODO(security): replace with AES-256-GCM using a key derived from the user's
 * PIN via PBKDF2/Argon2. Until then these are identity functions and note
 * bodies are stored in plaintext within the device's app sandbox.
 */
export async function encryptBody(plaintext: string /* , key: string */): Promise<string> {
  return plaintext;
}

export async function decryptBody(ciphertext: string /* , key: string */): Promise<string> {
  return ciphertext;
}
