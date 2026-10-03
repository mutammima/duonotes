import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import type { CryptoDeps } from './aes';
import { webCryptoAes } from './aes-webcrypto';
import { fromB64, toB64, toHex } from './bytes';
import {
  E2eeError, decryptNote, encryptNote, keyFingerprint, newIdentity, newNoteKey, unwrapKey, wrapFingerprint, wrapKey,
} from './envelope';

const deps: CryptoDeps = { aes: webCryptoAes, randomBytes: (n) => new Uint8Array(randomBytes(n)) };
const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));

describe('primitives (published test vectors)', () => {
  it('X25519 matches RFC 7748 §6.1', () => {
    const a = hex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a');
    const B = hex('de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f');
    expect(toHex(x25519.getPublicKey(a))).toBe('8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a');
    expect(toHex(x25519.getSharedSecret(a, B))).toBe('4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742');
  });
  it('HKDF-SHA256 matches RFC 5869 test case 1', () => {
    const okm = hkdf(sha256, new Uint8Array(22).fill(0x0b), hex('000102030405060708090a0b0c'), hex('f0f1f2f3f4f5f6f7f8f9'), 42);
    expect(toHex(okm)).toBe('3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865');
  });
});

describe('note encryption', () => {
  const key = newNoteKey(deps);
  it('round-trips unicode, empty title and a 1.5 MB body', async () => {
    const big = `<p>${'x'.repeat(1_500_000)}</p><img src="data:image/png;base64,AAAA">`;
    for (const plain of [{ title: '', body: '' }, { title: '日記 💞', body: '<p>héllo</p>' }, { title: 'Big', body: big }]) {
      expect(await decryptNote(deps, key, 'n1', await encryptNote(deps, key, 'n1', plain))).toEqual(plain);
    }
  });
  it('uses a fresh nonce every time', async () => {
    const p = { title: 't', body: 'b' };
    expect(await encryptNote(deps, key, 'n1', p)).not.toBe(await encryptNote(deps, key, 'n1', p));
  });
  it('fails on tampering, another note id, or the wrong key', async () => {
    const blob = await encryptNote(deps, key, 'n1', { title: 't', body: 'b' });
    const raw = fromB64(blob.slice(3));
    raw[raw.length - 1] ^= 1;
    await expect(decryptNote(deps, key, 'n1', `v1.${toB64(raw)}`)).rejects.toMatchObject({ code: 'decrypt-failed' });
    await expect(decryptNote(deps, key, 'n2', blob)).rejects.toMatchObject({ code: 'decrypt-failed' });
    await expect(decryptNote(deps, newNoteKey(deps), 'n1', blob)).rejects.toMatchObject({ code: 'decrypt-failed' });
  });
  it('refuses unknown versions and malformed blobs', async () => {
    await expect(decryptNote(deps, key, 'n1', 'v2.AAAA')).rejects.toMatchObject({ code: 'unsupported-version' });
    await expect(decryptNote(deps, key, 'n1', 'garbage')).rejects.toMatchObject({ code: 'malformed' });
    await expect(decryptNote(deps, key, 'n1', 'v1.!!!')).rejects.toMatchObject({ code: 'malformed' });
    await expect(decryptNote(deps, key, 'n1', 'v1.AAAA')).rejects.toBeInstanceOf(E2eeError);
  });
});

describe('key wrap', () => {
  const alice = newIdentity(deps);
  const bob = newIdentity(deps);
  const noteKey = newNoteKey(deps);
  it('only the recipient can unwrap, and only for that note', async () => {
    const w = await wrapKey(deps, noteKey, 'n1', bob.publicKey);
    expect(await unwrapKey(deps, w, 'n1', bob)).toEqual(noteKey);
    await expect(unwrapKey(deps, w, 'n1', alice)).rejects.toMatchObject({ code: 'decrypt-failed' });
    await expect(unwrapKey(deps, w, 'n2', bob)).rejects.toMatchObject({ code: 'decrypt-failed' });
  });
  it("records the recipient key's fingerprint", async () => {
    const w = await wrapKey(deps, noteKey, 'n1', bob.publicKey);
    expect(wrapFingerprint(w)).toBe(keyFingerprint(bob.publicKey));
    expect(keyFingerprint(bob.publicKey)).toMatch(/^[0-9a-f]{16}$/);
    expect(wrapFingerprint('nope')).toBeNull();
  });
});
