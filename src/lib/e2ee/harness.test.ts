import { x25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { describe, expect, it } from 'vitest';

describe('harness', () => {
  it('resolves noble and runs', () => {
    expect(x25519.getPublicKey(new Uint8Array(32).fill(1))).toHaveLength(32);
    expect(sha256(new Uint8Array())).toHaveLength(32);
  });
});
