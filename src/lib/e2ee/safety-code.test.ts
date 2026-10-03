import { describe, expect, it } from 'vitest';

import { safetyCode } from './safety-code';

const k = (n: number) => new Uint8Array(32).fill(n);

describe('safetyCode', () => {
  it('is 12 digits in three groups', () => expect(safetyCode(k(1), k(2))).toMatch(/^\d{4} \d{4} \d{4}$/));
  it('is the same on both phones', () => expect(safetyCode(k(1), k(2))).toBe(safetyCode(k(2), k(1))));
  it('is stable', () => expect(safetyCode(k(1), k(2))).toBe(safetyCode(k(1), k(2))));
  it('changes when either key changes', () => {
    expect(safetyCode(k(1), k(2))).not.toBe(safetyCode(k(1), k(3)));
    expect(safetyCode(k(1), k(2))).not.toBe(safetyCode(k(4), k(2)));
  });
  it('known-answer test', () => {
    // Computed: node -e "const crypto = require('crypto'); const buf = Buffer.concat([Buffer.from('duonotes:safety:v1'), Buffer.alloc(32, 1), Buffer.alloc(32, 2)]); const hash = crypto.createHash('sha256').update(buf).digest(); let n = 0; for (let i = 0; i < 5; i++) n = n * 256 + hash[i]; const s = (n % 1e12).toString().padStart(12, '0'); console.log(s.slice(0, 4) + ' ' + s.slice(4, 8) + ' ' + s.slice(8));"
    expect(safetyCode(k(1), k(2))).toBe('2078 2689 5008');
  });
});
