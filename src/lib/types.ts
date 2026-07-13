/**
 * Core domain types for DuoNotes.
 *
 * These mirror the Supabase tables defined in `supabase/schema.sql`
 * (snake_case columns are mapped to camelCase in `notes-context.tsx`).
 */

export type LockType = 'none' | 'pin' | 'biometric';

export interface User {
  id: string;
  email: string;
  /** Display name shown on shared notes, e.g. "Sam". */
  name: string;
  /** The linked partner's user id, or null until accounts are linked. */
  partnerId: string | null;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  /** Epoch millis of last edit — used for sorting and the list subtitle. */
  updatedAt: number;
  /** User id of the note author. */
  ownerId: string;
  /** Display name of the author (resolved from profiles) — used on shared notes. */
  ownerName: string;
  /** When true, the note is visible to the linked partner too. */
  isShared: boolean;
  /** How this note is protected. `'none'` opens without a challenge. */
  lockType: LockType;
}

/** A row from the `notes` table exactly as Supabase returns it. */
export interface NoteRow {
  id: string;
  owner_id: string;
  title: string;
  body: string;
  lock_type: LockType;
  is_shared: boolean;
  updated_at: string;
}
