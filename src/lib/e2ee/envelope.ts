/**
 * Locked-note envelope. Spec: docs/specs/2026-10-01-locked-note-encryption-design.md
 *
 *   note blob  v1.<b64(nonce12 ‖ ct ‖ tag16)>            AAD duonotes:note:v1:<noteId>
 *   wrap blob  v1.<fp16hex>.<b64(E32 ‖ nonce12 ‖ ct32 ‖ tag16)>   AAD duonotes:wrap:v1:<noteId>
 */
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

import type { CryptoDeps } from './aes';
import { type Bytes, concat, fromB64, fromUtf8, toB64, toHex, utf8 } from './bytes';

export type E2eeErrorCode = 'no-key' | 'unsupported-version' | 'malformed' | 'decrypt-failed';

export class E2eeError extends Error {
  constructor(readonly code: E2eeErrorCode) {
    super(code);
    this.name = 'E2eeError';
  }
}

export interface NotePlain {
  title: string;
  body: string;
}

export interface Identity {
  secretKey: Bytes;
  publicKey: Bytes;
}

const NONCE = 12;
const TAG = 16;
const KEY = 32;
const noteAad = (noteId: string) => utf8(`duonotes:note:v1:${noteId}`);
const wrapAad = (noteId: string) => utf8(`duonotes:wrap:v1:${noteId}`);
const WRAP_INFO = utf8('duonotes:wrap:v1');

export function identityFromSecret(secretKey: Bytes): Identity {
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) };
}

export function newIdentity(deps: CryptoDeps): Identity {
  return identityFromSecret(deps.randomBytes(KEY));
}

export function newNoteKey(deps: CryptoDeps): Bytes {
  return deps.randomBytes(KEY);
}

export function keyFingerprint(publicKey: Bytes): string {
  return toHex(sha256(publicKey)).slice(0, 16);
}

/** Splits "v1.a.b" into ["a", "b"], refusing other versions and part counts. */
function parse(blob: string, parts: number): string[] {
  const p = blob.split('.');
  if (p.length < 2) throw new E2eeError('malformed');
  if (p[0] !== 'v1') throw new E2eeError('unsupported-version');
  if (p.length !== parts) throw new E2eeError('malformed');
  return p.slice(1);
}

function decodeB64(s: string): Bytes {
  try {
    return fromB64(s);
  } catch {
    throw new E2eeError('malformed');
  }
}

export async function encryptNote(deps: CryptoDeps, noteKey: Bytes, noteId: string, plain: NotePlain): Promise<string> {
  const nonce = deps.randomBytes(NONCE);
  const ct = await deps.aes.encrypt(noteKey, nonce, utf8(JSON.stringify({ t: plain.title, b: plain.body })), noteAad(noteId));
  return `v1.${toB64(concat(nonce, ct))}`;
}

export async function decryptNote(deps: CryptoDeps, noteKey: Bytes, noteId: string, blob: string): Promise<NotePlain> {
  const [b64] = parse(blob, 2);
  const raw = decodeB64(b64);
  if (raw.length < NONCE + TAG) throw new E2eeError('malformed');
  let pt: Bytes;
  try {
    pt = await deps.aes.decrypt(noteKey, raw.subarray(0, NONCE), raw.subarray(NONCE), noteAad(noteId));
  } catch {
    throw new E2eeError('decrypt-failed');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromUtf8(pt));
  } catch {
    throw new E2eeError('malformed');
  }
  const o = parsed as { t?: unknown; b?: unknown };
  if (typeof o?.t !== 'string' || typeof o?.b !== 'string') throw new E2eeError('malformed');
  return { title: o.t, body: o.b };
}

function wrappingKey(shared: Bytes, ephemeralPublic: Bytes, recipientPublic: Bytes): Bytes {
  return hkdf(sha256, shared, concat(ephemeralPublic, recipientPublic), WRAP_INFO, KEY);
}

export async function wrapKey(deps: CryptoDeps, noteKey: Bytes, noteId: string, recipientPublicKey: Bytes): Promise<string> {
  const e = deps.randomBytes(KEY);
  const E = x25519.getPublicKey(e);
  const k = wrappingKey(x25519.getSharedSecret(e, recipientPublicKey), E, recipientPublicKey);
  const nonce = deps.randomBytes(NONCE);
  const ct = await deps.aes.encrypt(k, nonce, noteKey, wrapAad(noteId));
  return `v1.${keyFingerprint(recipientPublicKey)}.${toB64(concat(E, nonce, ct))}`;
}

export function wrapFingerprint(wrapped: string): string | null {
  const p = wrapped.split('.');
  return p.length === 3 && p[0] === 'v1' ? p[1] : null;
}

export async function unwrapKey(deps: CryptoDeps, wrapped: string, noteId: string, me: Identity): Promise<Bytes> {
  const [, b64] = parse(wrapped, 3);
  const raw = decodeB64(b64);
  if (raw.length !== KEY + NONCE + KEY + TAG) throw new E2eeError('malformed');
  const E = raw.subarray(0, KEY);
  try {
    const k = wrappingKey(x25519.getSharedSecret(me.secretKey, E), E, me.publicKey);
    return await deps.aes.decrypt(k, raw.subarray(KEY, KEY + NONCE), raw.subarray(KEY + NONCE), wrapAad(noteId));
  } catch {
    throw new E2eeError('decrypt-failed');
  }
}
