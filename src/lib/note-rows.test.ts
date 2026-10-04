import { describe, expect, it } from 'vitest';

import {
  forStorage, fromRow, isEncrypted, isSearchable, normalizeCached, REFETCH_UPDATED_AT, toForeignPatch, toOwnedRow,
} from './note-rows';
import type { Note, NoteRow } from './types';

const note = (over: Partial<Note> = {}): Note => ({
  id: 'n1', title: 'T', body: 'B', updatedAt: 1, ownerId: 'me', ownerName: 'Me',
  isShared: false, lockType: 'none', ciphertext: null, noteKeys: null, ...over,
});
const encrypted = note({ lockType: 'pin', ciphertext: 'v1.abc', noteKeys: { me: 'v1.f.w' }, title: 'LEAK', body: 'LEAK' });

describe('note-rows', () => {
  it('maps rows, including the new columns', () => {
    const row: NoteRow = { id: 'n1', owner_id: 'o', title: '', body: '', lock_type: 'pin', is_shared: true,
      updated_at: '2026-10-01T00:00:00.000Z', ciphertext: 'v1.x', note_keys: { o: 'v1.f.w' } };
    expect(fromRow(row, 'Owner')).toMatchObject({ ciphertext: 'v1.x', noteKeys: { o: 'v1.f.w' }, ownerName: 'Owner' });
  });
  it('treats cache from the previous version (no fields) as unencrypted', () => {
    const old = { ...note({ lockType: 'pin' }) } as Partial<Note>;
    delete old.ciphertext;
    delete old.noteKeys;
    const n = normalizeCached(old as Note);
    expect(n.ciphertext).toBeNull();
    expect(n.noteKeys).toBeNull();
    expect(isEncrypted(n)).toBe(false);
  });
  it('old format (no ciphertext key) forces a refetch: updatedAt can never match a server timestamp', () => {
    // The row may be encrypted on the server by now; an old entry must not be trusted as current.
    const old = { ...note({ lockType: 'pin', title: '', body: '', updatedAt: 1759276800000 }) } as Partial<Note>;
    delete old.ciphertext;
    delete old.noteKeys;
    expect(normalizeCached(old as Note).updatedAt).toBe(REFETCH_UPDATED_AT);
    expect(REFETCH_UPDATED_AT).not.toBe(new Date('2026-10-01T00:00:00.000Z').getTime());
  });
  it('new format with ciphertext null is kept as is, timestamp included', () => {
    const cached = note({ lockType: 'pin', updatedAt: 1759276800000 });
    const n = normalizeCached(cached);
    expect(n.updatedAt).toBe(1759276800000);
    expect(n).toEqual(cached);
    expect(normalizeCached(encrypted)).toEqual(encrypted);
  });
  it('never stores or uploads readable text for an encrypted note', () => {
    expect(forStorage(encrypted)).toMatchObject({ title: '', body: '', ciphertext: 'v1.abc' });
    expect(toOwnedRow(encrypted, 'me')).toMatchObject({ title: '', body: '', ciphertext: 'v1.abc', note_keys: { me: 'v1.f.w' } });
    expect(toForeignPatch(encrypted)).toMatchObject({ title: '', body: '', ciphertext: 'v1.abc' });
  });
  it('leaves unencrypted notes alone', () => {
    const n = note();
    expect(forStorage(n)).toBe(n);
    expect(toOwnedRow(n, 'me')).toMatchObject({ title: 'T', body: 'B', ciphertext: null, note_keys: null });
  });
  it('keeps encrypted notes out of search', () => {
    expect(isSearchable(encrypted)).toBe(false);
    expect(isSearchable(note())).toBe(true);
  });
});
