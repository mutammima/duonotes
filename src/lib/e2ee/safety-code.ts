import { sha256 } from '@noble/hashes/sha2.js';

import { type Bytes, compareBytes, concat, utf8 } from './bytes';

/**
 * The code both partners compare once, to prove the server didn't swap a public
 * key. Order-independent, so it reads the same on both phones. A server that
 * swaps keys at first exchange would need roughly 2^40 key generations per side
 * to match a code (hours on GPUs for a determined attacker); 12 digits is the
 * owner-approved trade-off for a code people read aloud.
 */
export function safetyCode(a: Bytes, b: Bytes): string {
  const [lo, hi] = compareBytes(a, b) <= 0 ? [a, b] : [b, a];
  const d = sha256(concat(utf8('duonotes:safety:v1'), lo, hi));
  let n = 0;
  for (let i = 0; i < 5; i++) n = n * 256 + d[i]; // 40 bits, exact in a double
  const s = (n % 1e12).toString().padStart(12, '0');
  return `${s.slice(0, 4)} ${s.slice(4, 8)} ${s.slice(8)}`;
}
