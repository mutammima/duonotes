import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync, getRandomBytes } from 'expo-crypto';

import type { Aes, CryptoDeps } from './aes';

// Always pass Uint8Array: expo-crypto treats string inputs as base64.
export const expoAes: Aes = {
  async encrypt(key, nonce, plaintext, aad) {
    const k = await AESEncryptionKey.import(key);
    const sealed = await aesEncryptAsync(plaintext, k, { nonce: { bytes: nonce }, additionalData: aad });
    return sealed.ciphertext({ includeTag: true });
  },
  async decrypt(key, nonce, ciphertextAndTag, aad) {
    const k = await AESEncryptionKey.import(key);
    const sealed = AESSealedData.fromParts(nonce, ciphertextAndTag, 16);
    return aesDecryptAsync(sealed, k, { additionalData: aad });
  },
};

export const expoDeps: CryptoDeps = { aes: expoAes, randomBytes: getRandomBytes };
