import { describe, expect, it } from 'vitest';

import { canWrapFor, evaluatePartnerKey, markVerified } from './partner-trust';

describe('evaluatePartnerKey', () => {
  it('none when the partner has no key, keeping what is stored', () => {
    expect(evaluatePartnerKey(null, null)).toEqual({ status: 'none', next: null });
    const stored = { key: 'A', verified: true };
    expect(evaluatePartnerKey(stored, null)).toEqual({ status: 'none', next: stored });
  });
  it('trusts on first use, unverified', () => {
    expect(evaluatePartnerKey(null, 'A')).toEqual({ status: 'unverified', next: { key: 'A', verified: false } });
  });
  it('keeps the verified flag while the key is unchanged', () => {
    expect(evaluatePartnerKey({ key: 'A', verified: true }, 'A').status).toBe('verified');
    expect(evaluatePartnerKey({ key: 'A', verified: false }, 'A').status).toBe('unverified');
  });
  it('flags a changed key and does NOT adopt it', () => {
    const stored = { key: 'A', verified: true };
    expect(evaluatePartnerKey(stored, 'B')).toEqual({ status: 'changed', next: stored });
  });
});

describe('canWrapFor / markVerified', () => {
  it('wraps only for unverified (first use) or verified keys', () => {
    expect(canWrapFor('unverified')).toBe(true);
    expect(canWrapFor('verified')).toBe(true);
    expect(canWrapFor('changed')).toBe(false);
    expect(canWrapFor('none')).toBe(false);
  });
  it('verifying adopts the current key', () => {
    expect(evaluatePartnerKey(markVerified('B'), 'B').status).toBe('verified');
  });
});
