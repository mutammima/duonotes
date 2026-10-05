import { describe, expect, it } from 'vitest';

import { safetyCode } from './safety-code';

const k = (n: number) => new Uint8Array(32).fill(n);

describe('safetyCode', () => {
  it('is 12 digits in three groups', () => expect(safetyCode(k(1))).toMatch(/^\d{4} \d{4} \d{4}$/));
  it('is stable', () => expect(safetyCode(k(1))).toBe(safetyCode(k(1))));
  it('different keys give different codes', () => {
    expect(safetyCode(k(1))).not.toBe(safetyCode(k(2)));
    expect(safetyCode(k(1))).not.toBe(safetyCode(k(3)));
  });
  it('known-answer test (one code per public key)', () => {
    // Computed: node -e "const crypto = require('crypto'); for (const f of [1,2]) { const buf = Buffer.concat([Buffer.from('duonotes:safety:v2'), Buffer.alloc(32, f)]); const hash = crypto.createHash('sha256').update(buf).digest(); let n = 0; for (let i = 0; i < 5; i++) n = n * 256 + hash[i]; const s = (n % 1e12).toString().padStart(12, '0'); console.log(f, s.slice(0, 4) + ' ' + s.slice(4, 8) + ' ' + s.slice(8)); }"
    expect(safetyCode(k(1))).toBe('6551 8688 7936');
    expect(safetyCode(k(2))).toBe('6634 4120 7265');
  });
});
