/**
 * Core domain types for DuoNotes.
 *
 * NOTE: This scaffold persists everything on-device (see `storage.ts`). The
 * `ownerId` / `sharedWith` fields model the *eventual* multi-user sync backend
 * (e.g. Supabase / Firebase / a custom API). Until that backend is wired up,
 * "sharing" is simulated locally. See README → "Roadmap & what is a placeholder".
 */

export type LockType = 'none' | 'pin' | 'biometric';

export interface User {
  id: string;
  email: string;
  /** Display name shown on shared notes, e.g. "Sam". */
  name: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  /** Epoch millis of last edit — used for sorting and the list subtitle. */
  updatedAt: number;
  /** User id of the note author. */
  ownerId: string;
  /** User ids this note is shared with (the partner). */
  sharedWith: string[];
  /** How this note is protected. `'none'` means it opens without a challenge. */
  lockType: LockType;
}

export interface AuthSession {
  user: User;
}
