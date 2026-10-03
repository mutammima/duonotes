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

describe('trust-transition state machine', () => {
  it('unverified stored key that changes → changed, next === stored', () => {
    const stored = { key: 'A', verified: false };
    const result = evaluatePartnerKey(stored, 'B');
    expect(result.status).toBe('changed');
    expect(result.next).toBe(stored);
  });
  it('changed status persists: same evaluation again returns changed', () => {
    const stored = { key: 'A', verified: true };
    const result1 = evaluatePartnerKey(stored, 'B');
    const result2 = evaluatePartnerKey(result1.next, 'B');
    expect(result2.status).toBe('changed');
    expect(result2.next).toBe(stored);
  });
  it('recovery: changed → verify → verified', () => {
    const stored = { key: 'A', verified: true };
    // First: current key changed
    const changed = evaluatePartnerKey(stored, 'B');
    expect(changed.status).toBe('changed');
    // Then: user verifies and marks the new key
    const verified = evaluatePartnerKey(markVerified('B'), 'B');
    expect(verified.status).toBe('verified');
    expect(verified.next?.key).toBe('B');
    expect(verified.next?.verified).toBe(true);
  });
});
