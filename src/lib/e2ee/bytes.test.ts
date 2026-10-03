import { describe, expect, it } from 'vitest';

import { compareBytes, concat, fromB64, fromUtf8, toB64, toHex, utf8 } from './bytes';

const SAMPLES = ['', 'hello', 'héllo wörld', '日本語のノート', '💞🔒 emoji', 'a\u0000b', 'x'.repeat(10_000)];

describe('utf8', () => {
  it('matches TextEncoder and round-trips', () => {
    for (const s of SAMPLES) {
      expect(utf8(s)).toEqual(new TextEncoder().encode(s));
      expect(fromUtf8(utf8(s))).toBe(s);
    }
  });
  it('replaces lone surrogates like TextEncoder', () => {
    for (const s of ['\ud800', 'a\udc00b', '\ud83d']) expect(utf8(s)).toEqual(new TextEncoder().encode(s));
  });
  it('rejects invalid UTF-8', () => {
    for (const bad of [[0xff], [0xc0, 0x80], [0xe0, 0x80], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xc3]]) {
      expect(() => fromUtf8(Uint8Array.from(bad))).toThrow();
    }
  });
});

describe('base64/hex/concat/compare', () => {
  it('round-trips base64, including 3 MB without overflowing the stack', () => {
    const big = new Uint8Array(3 * 1024 * 1024).map((_, i) => i & 255);
    expect(fromB64(toB64(big))).toEqual(big);
    expect(toB64(Uint8Array.from([0xde, 0xad, 0xbe, 0xef]))).toBe('3q2+7w==');
  });
  it('hex encodes', () => expect(toHex(Uint8Array.from([0, 15, 255]))).toBe('000fff'));
  it('concatenates', () => expect(concat(Uint8Array.from([1]), Uint8Array.from([2, 3]))).toEqual(Uint8Array.from([1, 2, 3])));
  it('orders bytes lexicographically', () => {
    expect(compareBytes(Uint8Array.from([1, 2]), Uint8Array.from([1, 3]))).toBeLessThan(0);
    expect(compareBytes(Uint8Array.from([2]), Uint8Array.from([1, 9]))).toBeGreaterThan(0);
    expect(compareBytes(Uint8Array.from([1]), Uint8Array.from([1]))).toBe(0);
  });
});
