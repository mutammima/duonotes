import { describe, expect, it } from 'vitest';

import { webCryptoAes as aes } from './aes-webcrypto';
import { utf8 } from './bytes';

const key = new Uint8Array(32).fill(7);
const nonce = new Uint8Array(12).fill(1);
const aad = utf8('duonotes:note:v1:abc');

describe('webCryptoAes', () => {
  it('round-trips and appends a 16-byte tag', async () => {
    const pt = utf8('secret');
    const ct = await aes.encrypt(key, nonce, pt, aad);
    expect(ct).toHaveLength(pt.length + 16);
    expect(await aes.decrypt(key, nonce, ct, aad)).toEqual(pt);
  });
  it('rejects a flipped byte, wrong AAD, or wrong key', async () => {
    const ct = await aes.encrypt(key, nonce, utf8('secret'), aad);
    const flipped = ct.slice();
    flipped[0] ^= 1;
    await expect(aes.decrypt(key, nonce, flipped, aad)).rejects.toThrow();
    await expect(aes.decrypt(key, nonce, ct, utf8('other'))).rejects.toThrow();
    await expect(aes.decrypt(new Uint8Array(32), nonce, ct, aad)).rejects.toThrow();
  });
});
