import { sha256 } from '@noble/hashes/sha2.js';

import { type Bytes, concat, utf8 } from './bytes';

/**
 * The code for ONE public key. Each phone shows "Your code" (its own key) and
 * "Partner's code" (the key it holds for the partner); the partners check that
 * each phone's "Your code" matches the other phone's "Partner's code".
 *
 * Per-key codes, not one code over both keys: a combined code only has to match
 * some code the attacker can steer from both sides, which is a 40-bit collision
 * (~2^20 work). Here the target is fixed by the real key, so a server that swaps
 * a public key must find a key whose 40-bit code equals that fixed code: a second
 * preimage, ~2^40 key generations. 12 digits is the owner-approved trade-off for
 * codes people read aloud.
 */
export function safetyCode(publicKey: Bytes): string {
  const d = sha256(concat(utf8('duonotes:safety:v2'), publicKey));
  let n = 0;
  for (let i = 0; i < 5; i++) n = n * 256 + d[i]; // 40 bits, exact in a double
  const s = (n % 1e12).toString().padStart(12, '0');
  return `${s.slice(0, 4)} ${s.slice(4, 8)} ${s.slice(8)}`;
}
