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

/** Cache written by a build that predates encryption has neither field. */
export function normalizeCached(n: Note): Note {
  return { ...n, ciphertext: n.ciphertext ?? null, noteKeys: n.noteKeys ?? null };
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
