import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import type { CryptoDeps } from './aes';
import { webCryptoAes } from './aes-webcrypto';
import { keyFingerprint, newIdentity, wrapKey } from './envelope';
import {
  addReader, type MaintenanceNote, openNote, openNoteKey, planMaintenance, rotationReader, sealNote,
} from './locked-notes';

const deps: CryptoDeps = { aes: webCryptoAes, randomBytes: (n) => new Uint8Array(randomBytes(n)) };
const alice = { userId: 'alice', identity: newIdentity(deps) };
const bob = { userId: 'bob', identity: newIdentity(deps) };
const A = { userId: 'alice', publicKey: alice.identity.publicKey };
const B = { userId: 'bob', publicKey: bob.identity.publicKey };
const plain = { title: 'Secret', body: '<p>body</p>' };

describe('seal / open', () => {
  it('every reader can open it; others get no-key', async () => {
    const s = await sealNote(deps, 'n1', plain, [A, B]);
    expect((await openNote(deps, 'n1', s, alice)).plain).toEqual(plain);
    expect((await openNote(deps, 'n1', s, bob)).plain).toEqual(plain);
    const solo = await sealNote(deps, 'n1', plain, [A]);
    await expect(openNote(deps, 'n1', solo, bob)).rejects.toMatchObject({ code: 'no-key' });
  });
  it('addReader lets a new reader open it with the same note key', async () => {
    const s = await sealNote(deps, 'n1', plain, [A]);
    const noteKeys = await addReader(deps, 'n1', s.noteKey, s.noteKeys, B);
    expect(Object.keys(noteKeys).sort()).toEqual(['alice', 'bob']);
    expect((await openNote(deps, 'n1', { ciphertext: s.ciphertext, noteKeys }, bob)).noteKey).toEqual(s.noteKey);
  });
});

describe('openNoteKey (share/wrap without decrypting the body)', () => {
  it('returns the note key from my wrap alone', async () => {
    const s = await sealNote(deps, 'n1', plain, [A]);
    expect(await openNoteKey(deps, 'n1', s.noteKeys, alice)).toEqual(s.noteKey);
  });
  it('no wrap for me → no-key; a wrap moved to another note fails', async () => {
    const s = await sealNote(deps, 'n1', plain, [A]);
    await expect(openNoteKey(deps, 'n1', s.noteKeys, bob)).rejects.toMatchObject({ code: 'no-key' });
    await expect(openNoteKey(deps, 'n2', s.noteKeys, alice)).rejects.toBeTruthy();
  });
});

describe('rotationReader (unshare)', () => {
  it('keeps the OWNER as the only reader, whoever unshares', () => {
    expect(rotationReader('alice', A, B)).toBe(A);
    expect(rotationReader('bob', A, B)).toBe(B);
    expect(rotationReader('bob', A, null)).toBeNull();
  });
});

describe('planMaintenance', () => {
  const base = { ownerId: 'alice', isShared: false, ciphertext: null, noteKeys: null } as const;
  const notes: MaintenanceNote[] = [
    { ...base, id: 'legacy', lockType: 'pin' },
    { ...base, id: 'plain', lockType: 'none' },
    { ...base, id: 'theirs-legacy', ownerId: 'bob', lockType: 'pin', isShared: true },
  ];
  it("seals only MY legacy locked notes", () => {
    expect(planMaintenance({ notes, myUserId: 'alice', partner: null }).sealLegacy).toEqual(['legacy']);
  });
  it('wraps for the partner only where needed, and only when trusted', async () => {
    const fp = keyFingerprint(B.publicKey);
    const shared = await sealNote(deps, 's', plain, [A]);
    const both = await sealNote(deps, 'both', plain, [A, B]);
    const stale = { ...shared.noteKeys, bob: await wrapKey(deps, shared.noteKey, 's2', newIdentity(deps).publicKey) };
    const enc = (id: string, s: { ciphertext: string; noteKeys: Record<string, string> }, isShared = true): MaintenanceNote =>
      ({ id, ownerId: 'alice', lockType: 'pin', isShared, ciphertext: s.ciphertext, noteKeys: s.noteKeys });
    const list: MaintenanceNote[] = [
      enc('needs', shared),
      enc('done', both),
      enc('stale', { ciphertext: shared.ciphertext, noteKeys: stale }),
      enc('private', shared, false),
      // A note I can't open (no wrap for me): must never be touched.
      { id: 'unopenable', ownerId: 'bob', lockType: 'pin' as const, isShared: true, ciphertext: 'v1.x', noteKeys: { bob: 'v1.y.z' } },
    ];
    expect(planMaintenance({ notes: list, myUserId: 'alice', partner: { userId: 'bob', fingerprint: fp } }).wrapForPartner)
      .toEqual(['needs', 'stale']);
    expect(planMaintenance({ notes: list, myUserId: 'alice', partner: null }).wrapForPartner).toEqual([]);
  });
});
