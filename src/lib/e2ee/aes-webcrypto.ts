import type { Aes } from './aes';
import type { Bytes } from './bytes';

// WebCrypto's BufferSource excludes SharedArrayBuffer-backed views.
const buf = (b: Bytes) => b as Uint8Array<ArrayBuffer>;

/** Tests only. The app uses `aes-expo.ts`. */
export const webCryptoAes: Aes = {
  async encrypt(key, nonce, plaintext, aad) {
    const k = await crypto.subtle.importKey('raw', buf(key), 'AES-GCM', false, ['encrypt']);
    const out = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(nonce), additionalData: buf(aad), tagLength: 128 }, k, buf(plaintext));
    return new Uint8Array(out);
  },
  async decrypt(key, nonce, ciphertextAndTag, aad) {
    const k = await crypto.subtle.importKey('raw', buf(key), 'AES-GCM', false, ['decrypt']);
    const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(nonce), additionalData: buf(aad), tagLength: 128 }, k, buf(ciphertextAndTag));
    return new Uint8Array(out);
  },
};
