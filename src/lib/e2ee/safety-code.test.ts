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
});
