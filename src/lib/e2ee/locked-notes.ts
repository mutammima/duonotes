import type { CryptoDeps } from './aes';
import type { Bytes } from './bytes';
import {
  E2eeError, type Identity, type NotePlain, encryptNote, decryptNote, newNoteKey, unwrapKey, wrapFingerprint, wrapKey,
} from './envelope';

export interface Reader {
  userId: string;
  publicKey: Bytes;
}

export interface Sealed {
  ciphertext: string;
  noteKeys: Record<string, string>;
}

export interface Opened {
  plain: NotePlain;
  noteKey: Bytes;
}

export async function sealNote(
  deps: CryptoDeps, noteId: string, plain: NotePlain, readers: Reader[],
): Promise<Sealed & { noteKey: Bytes }> {
  const noteKey = newNoteKey(deps);
  const noteKeys: Record<string, string> = {};
  for (const r of readers) noteKeys[r.userId] = await wrapKey(deps, noteKey, noteId, r.publicKey);
  return { ciphertext: await encryptNote(deps, noteKey, noteId, plain), noteKeys, noteKey };
}

export async function openNote(
  deps: CryptoDeps, noteId: string, sealed: Sealed, me: { userId: string; identity: Identity },
): Promise<Opened> {
  const wrapped = sealed.noteKeys[me.userId];
  if (!wrapped) throw new E2eeError('no-key');
  const noteKey = await unwrapKey(deps, wrapped, noteId, me.identity);
  return { plain: await decryptNote(deps, noteKey, noteId, sealed.ciphertext), noteKey };
}

export async function addReader(
  deps: CryptoDeps, noteId: string, noteKey: Bytes, noteKeys: Record<string, string>, reader: Reader,
): Promise<Record<string, string>> {
  return { ...noteKeys, [reader.userId]: await wrapKey(deps, noteKey, noteId, reader.publicKey) };
}

/** Unsharing re-keys the note for its OWNER alone, even when the partner unshares. */
export function rotationReader(ownerId: string, me: Reader, partner: Reader | null): Reader | null {
  if (ownerId === me.userId) return me;
  return partner && partner.userId === ownerId ? partner : null;
}

export interface MaintenanceNote {
  id: string;
  ownerId: string;
  lockType: 'none' | 'pin' | 'biometric';
  isShared: boolean;
  ciphertext: string | null;
  noteKeys: Record<string, string> | null;
}

/**
 * What this phone should fix on each sync:
 *  - sealLegacy: my locked notes from before encryption (still readable).
 *  - wrapForPartner: shared encrypted notes I can open whose partner wrap is
 *    missing or was made for an older partner key.
 * Notes I can't open are never touched.
 */
export function planMaintenance(input: {
  notes: MaintenanceNote[];
  myUserId: string;
  partner: { userId: string; fingerprint: string } | null;
}): { sealLegacy: string[]; wrapForPartner: string[] } {
  const { notes, myUserId, partner } = input;
  const sealLegacy = notes
    .filter((n) => n.ownerId === myUserId && n.lockType !== 'none' && n.ciphertext == null)
    .map((n) => n.id);
  const wrapForPartner = !partner
    ? []
    : notes
        .filter((n) => n.ciphertext != null && n.isShared && n.noteKeys?.[myUserId])
        .filter((n) => {
          const w = n.noteKeys?.[partner.userId];
          return !w || wrapFingerprint(w) !== partner.fingerprint;
        })
        .map((n) => n.id);
  return { sealLegacy, wrapForPartner };
}
