import type { Bytes } from './bytes';

/** AES-256-GCM with a 16-byte tag. `encrypt` returns ciphertext‖tag. */
export interface Aes {
  encrypt(key: Bytes, nonce: Bytes, plaintext: Bytes, aad: Bytes): Promise<Bytes>;
  /** Rejects on any authentication failure. */
  decrypt(key: Bytes, nonce: Bytes, ciphertextAndTag: Bytes, aad: Bytes): Promise<Bytes>;
}

export interface CryptoDeps {
  aes: Aes;
  randomBytes(n: number): Bytes;
}
