import { describe, expect, it } from 'vitest';

import { canWrapFor, evaluatePartnerKey, markRejected, markVerified, parsePartnerTrust } from './partner-trust';

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

describe("rejecting a key (They don't match)", () => {
  it('reject → changed (no wraps) → verify → verified', () => {
    const rejected = markRejected('A');
    const r1 = evaluatePartnerKey(rejected, 'A');
    expect(r1.status).toBe('changed');
    expect(canWrapFor(r1.status)).toBe(false);
    expect(r1.next).toBe(rejected); // nothing re-adopts it
    expect(evaluatePartnerKey(r1.next, 'A').status).toBe('changed'); // stays rejected across launches
    const verified = evaluatePartnerKey(markVerified('A'), 'A');
    expect(verified.status).toBe('verified');
    expect(verified.next).not.toHaveProperty('rejected');
  });
  it('a different key after a rejection is still changed', () => {
    expect(evaluatePartnerKey(markRejected('A'), 'B').status).toBe('changed');
  });
  it('no key from the partner keeps the rejection stored', () => {
    const rejected = markRejected('A');
    expect(evaluatePartnerKey(rejected, null)).toEqual({ status: 'none', next: rejected });
  });
});

describe('parsePartnerTrust (fail closed)', () => {
  it('null when nothing is stored (first use)', () => expect(parsePartnerTrust(null)).toBeNull());
  it('reads valid records, with or without the rejected flag', () => {
    expect(parsePartnerTrust('{"key":"A","verified":true}')).toEqual({ key: 'A', verified: true });
    expect(parsePartnerTrust('{"key":"A","verified":false,"rejected":true}')).toEqual(markRejected('A'));
  });
  it('throws on anything else, so a corrupt record never reads as first use', () => {
    const bad = [
      '', 'null', 'not json', '[]', '{"key":"A"}', '{"key":1,"verified":true}', '{"key":"A","verified":"yes"}',
      '{"key":"A","verified":false,"rejected":false}', '{"key":"A","verified":false,"rejected":"true"}',
    ];
    for (const raw of bad) expect(() => parsePartnerTrust(raw), raw).toThrow('corrupt partner-trust record');
  });
});
