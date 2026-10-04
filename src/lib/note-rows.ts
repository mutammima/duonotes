/**
 * The one place a Note becomes a row, a cache entry or a search entry, so the
 * rule "an encrypted note never carries readable text" is enforced at every
 * exit, not just where it was remembered.
 */
import type { Note, NoteRow } from './types';

export const NOTE_COLUMNS = 'id, owner_id, title, body, lock_type, is_shared, updated_at, ciphertext, note_keys';

export function isEncrypted(n: { ciphertext?: string | null }): boolean {
  return n.ciphertext != null;
}

export function fromRow(row: NoteRow, ownerName: string): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    lockType: row.lock_type,
    isShared: row.is_shared,
    ownerId: row.owner_id,
    ownerName,
    updatedAt: new Date(row.updated_at).getTime(),
    ciphertext: row.ciphertext ?? null,
    noteKeys: row.note_keys ?? null,
  };
}

/**
 * `updatedAt` for a cache entry that must be refetched. Server timestamps are real
 * dates, so reconcile's "same updatedAt → keep the cached copy" check never matches it.
 */
export const REFETCH_UPDATED_AT = 0;

/**
 * Cache written by a build that predates encryption has neither field. Such an
 * entry may describe a row that is encrypted on the server by now (the other phone
 * sealed it), and read as `ciphertext: null` it would look like a readable locked
 * note that maintenance should seal, sealing '' over the real text. So an entry
 * with no `ciphertext` key at all (old format, unlike a present `null`) gets an
 * `updatedAt` that forces reconcile to download the row again.
 */
export function normalizeCached(n: Note): Note {
  const oldFormat = !('ciphertext' in n);
  return {
    ...n,
    ciphertext: n.ciphertext ?? null,
    noteKeys: n.noteKeys ?? null,
    ...(oldFormat ? { updatedAt: REFETCH_UPDATED_AT } : {}),
  };
}

export function forStorage(n: Note): Note {
  return isEncrypted(n) ? { ...n, title: '', body: '' } : n;
}

export function toForeignPatch(n: Note): Record<string, unknown> {
  const enc = isEncrypted(n);
  return {
    title: enc ? '' : n.title,
    body: enc ? '' : n.body,
    lock_type: n.lockType,
    is_shared: n.isShared,
    ciphertext: n.ciphertext ?? null,
    note_keys: n.noteKeys ?? null,
  };
}

export function toOwnedRow(n: Note, uid: string): Record<string, unknown> {
  return { id: n.id, owner_id: uid, ...toForeignPatch(n) };
}

export function isSearchable(n: Note): boolean {
  return !isEncrypted(n);
}
