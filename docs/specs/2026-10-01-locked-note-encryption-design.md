# Locked-note encryption — design

Status: **draft for owner review** · 2026-10-01

Locked notes become end-to-end encrypted: the title and body are encrypted on the
phone, so neither Supabase nor a copy of the phone's app storage can read them.
Today `lock_type` only gates the UI, and the text sits in plaintext in both the
`duonotes_notes` table and the on-device notes cache (`README.md`, "What's real
vs. placeholder"; `src/lib/crypto.ts`).

## Decisions (owner, 2026-10-01)

| # | Question | Decision |
|---|---|---|
| 1 | Protect against whom? | **Both**: anyone who can read the database (dashboard, leaked service key, RLS bug) **and** anyone holding the phone or a copy of its app storage. |
| 2 | Forgotten PIN / lost phone | **No recovery.** Nothing that can unlock a note is ever stored server-side. A lost phone loses its owner's private locked notes; shared ones survive on the partner's phone. |
| 3 | New iPhone | **The key moves with Apple's transfer** (Quick Start or encrypted-backup restore). Keychain item is migratable, not `…THIS_DEVICE_ONLY`. |
| 4 | Titles | **Encrypted too.** The list shows "Locked note" until unlocked. |
| 5 | Sharing model | **Approach A: one X25519 key pair per person**, a random key per note, the note key wrapped for each reader. |

Rejected: a couple key paired in person (two systems, needs a camera rebuild);
a PIN-derived key (`PIN_LENGTH` is 4, i.e. 10,000 guesses against any database copy).

## Goals and non-goals

**Goals**
- A locked note's title and body are never stored readable on the server or in the
  on-device cache.
- Shared locked notes open on both phones, offline included, with no change to daily use.
- Ships as an over-the-air update (no rebuild), and the database change is additive.

**Non-goals**
- Hiding metadata: owner, `lock_type`, `is_shared`, timestamps and approximate size stay visible.
- Encrypting unlocked notes.
- Protecting a note's *integrity* from the partner. They can already edit, unlock or
  unshare a shared note under the existing RLS, and that does not change.
- Search inside locked notes (see "Search").

## Threat model

| Adversary | Today | After |
|---|---|---|
| Reads the database (dashboard, service key, RLS bug, Supabase backup) | Reads every locked note | Sees ciphertext and metadata only |
| Has the phone's app storage (AsyncStorage dump, unencrypted backup) | Reads every locked note | Sees ciphertext; the private key is in the Keychain, not AsyncStorage |
| Holds the unlocked phone | Blocked by the PIN / Face ID gate | Same gate; the key is only used after it passes |
| Controls the server and swaps a public key | n/a | Caught by the safety code (below) once compared |
| Has the encrypted iPhone backup **and** its password | n/a | Can recover the key (accepted, decision 3) |

## Cryptography

All primitives are standard; nothing is invented here.

- **Identity key:** X25519 (`@noble/curves/ed25519` `x25519`). The private key is
  32 bytes from `expo-crypto` `getRandomBytes`, stored base64 in SecureStore under
  `duonotes.e2ee.sk.<userId>` with `keychainAccessible: AFTER_FIRST_UNLOCK`
  (migratable; readable while the app syncs in the background after first unlock).
  The public key is stored base64 in `duonotes_profiles.public_key`.
- **Note key:** 32 random bytes per locked note (AES-256).
- **Note encryption:** AES-256-GCM, 12-byte random nonce, 16-byte tag.
  - Plaintext: UTF-8 JSON `{"t": title, "b": body}`.
  - AAD: `duonotes:note:v1:<noteId>`, so ciphertext moved to another row fails to decrypt.
  - Stored as `ciphertext = "v1." + base64(nonce ‖ ct ‖ tag)`.
  - A fresh nonce on every save.
- **Key wrap (sealed box):** for each reader with public key `R`:
  - ephemeral X25519 key pair `(e, E)`;
  - `K = HKDF-SHA256(ikm = x25519(e, R), salt = E ‖ R, info = "duonotes:wrap:v1", len = 32)`;
  - AES-256-GCM(`K`, random nonce, AAD `duonotes:wrap:v1:<noteId>`) over the note key;
  - stored as `"v1." + base64(E ‖ nonce ‖ ct ‖ tag)` in `note_keys[<readerUserId>]`.
- **Safety code:** `SHA-256("duonotes:safety:v1" ‖ min(Pa,Pb) ‖ max(Pa,Pb))`. The first
  5 bytes are shown as **12 digits in three groups** (`4821 0937 5560`), the same on
  both phones regardless of order. Digits rather than words, to avoid shipping a word list.
- **Versioning:** every stored blob is prefixed `v1.`. Unknown versions are refused, never guessed.

AES runs in `expo-crypto` 57's native AES-GCM on device (already in the installed
binary). X25519, HKDF and SHA-256 come from `@noble/curves` / `@noble/hashes`
(audited, pure JS, no native code). Before shipping, confirm the update fingerprint
does not move (AGENTS.md).

## Data model (additive migration)

Added to `supabase/schema.sql`, which is already written to be re-run safely (there
is no migrations folder):

```sql
alter table public.duonotes_profiles add column if not exists public_key text;
alter table public.duonotes_notes    add column if not exists ciphertext text;
alter table public.duonotes_notes    add column if not exists note_keys  jsonb;

-- An encrypted note may not also carry readable text. Stops an older app
-- build from silently writing plaintext into an encrypted row.
alter table public.duonotes_notes drop constraint if exists duonotes_notes_encrypted_is_blank;
alter table public.duonotes_notes add constraint duonotes_notes_encrypted_is_blank
  check (ciphertext is null or (title = '' and body = ''));
```

The existing RLS policies already cover the new columns (row-level). Checked
2026-10-01: `duonotes_profiles_select` lets you read your partner's row (so their
`public_key`), and `duonotes_profiles_update` lets you change only your own. No
policy changes needed.

## Behaviour

**Key setup.** On sign-in, if this phone has no private key for this user, it
creates one and writes `public_key`. If the stored `public_key` differs from this
phone's key (for example a new phone without transfer), the phone publishes its own
and treats it as a fresh identity. Its old wraps are then unreadable; see
"Partner re-keys".

**Partner key trust.** Trust on first use. The first partner key seen is recorded
locally as `trustedPartnerKey`, marked unverified, and shown as *Not verified* in
Settings until the codes are compared. If the partner's key later changes:
- a banner says *"{name}'s key changed — verify again"*;
- **no note key is wrapped for the new key until it is verified**.

**Lock a note** (owner or partner, as today):
1. Ensure the identity key exists.
2. Generate a note key, then encrypt `{title, body}`.
3. Set `note_keys` = {self, plus the partner if `is_shared` and their key is trusted}.
4. Set `title = ''`, `body = ''`, then save.

**Open a locked note.** After the PIN / Face ID gate passes (unchanged): unwrap
`note_keys[me]`, decrypt, and hold the plaintext **in memory only** for that screen.
Leaving the screen or backgrounding the app drops it, matching the existing
`setUnlocked(false)` behaviour.

**Edit a locked note.** Re-encrypt with the same note key and a fresh nonce. `note_keys` is unchanged.

**Wrap reconciliation (replaces "sharing waits").** On every sync, the phone checks
each locked shared note it can decrypt. If a trusted partner key has no wrap, it adds
one. So sharing never blocks: until the wrap lands, the partner sees
*"🔒 Waiting for {owner}'s phone to share the key"*. The same pass re-wraps for a
partner who re-keyed, once that key is verified.

**Unshare a locked note.** Rotate: a new note key, re-encrypted, `note_keys` = {owner}.

**Remove a lock.** Decrypt, write readable `title`/`body`, and set `ciphertext` and `note_keys` to null.

**Existing locked notes.** After key setup, each owner's phone encrypts its own
`lock_type != 'none'` notes that have `ciphertext is null`. Readable copies may persist
in Supabase backups until they expire; the README says so.

**Account deletion.** Delete the private key from the Keychain as part of
`wipeLocalUserData`. Sign-out keeps it, because it is per user ID and survives
signing back in.

**Search.** Notes with `ciphertext` are excluded from search entirely (today only
their bodies are). A note unlocked in the current screen is not added to search.

**Failure handling.** Every decrypt failure shows *"This note can't be opened on
this phone"* plus the reason: no key for you yet, key changed, damaged data, or
unknown version. It never shows partial text and never falls back to plaintext. The
encryption step runs before the dirty queue, so a failure to encrypt means **nothing
is saved**. The note stays as it was and the user sees an error.

## Code structure

| Unit | Responsibility | Depends on |
|---|---|---|
| `src/lib/e2ee/aes.ts` | `seal(key, plaintext, aad)` / `open(key, blob, aad)` | `expo-crypto` (app); WebCrypto (tests) |
| `src/lib/e2ee/envelope.ts` | `encryptNote` / `decryptNote` / `wrapKey` / `unwrapKey` (pure) | `aes.ts`, `@noble/*` |
| `src/lib/e2ee/safety-code.ts` | `safetyCode(pubA, pubB)` (pure) | `@noble/hashes` |
| `src/lib/e2ee/keys.ts` | load/create identity, publish `public_key`, trusted partner key | SecureStore, Supabase |
| `src/context/notes-context.tsx` | encrypt at the save point; `openLocked(id)`; wrap reconciliation; map new columns | the units above |
| `src/app/note/[id].tsx` | call `openLocked` after the gate | context |
| `src/components/note-row.tsx`, `note-list.tsx` | "Locked note" title; exclude encrypted notes from search | — |
| Settings: *Verify {partner}* | show the code, mark verified, key-changed banner | `safety-code.ts`, `keys.ts` |
| `src/lib/crypto.ts` | delete the `encryptBody` / `decryptBody` placeholders | — |

## Testing

First automated tests in the repo: **Vitest**, run with `npx vitest run`. **No
`package.json` script is added**, because scripts are a fingerprint input (AGENTS.md).
Vitest is a devDependency, and devDependencies were shown not to move the fingerprint
in PR #34.

- Round trip: unicode, emoji, empty title, a ≥1 MB body with an inline image.
- Tamper: flipping any byte of nonce, ciphertext or tag fails.
- AAD: a blob or wrap moved to another note ID fails.
- Wrong reader: a wrap for A cannot be opened with B's key.
- RFC 7748 X25519 test vectors; RFC 5869 HKDF vectors.
- Safety code: order-independent, stable, different keys give a different code.
- Save-point invariant: for a locked note, what is cached and queued has empty
  `title`/`body` and a `v1.` ciphertext.

On device (owner checklist): encrypt on phone A and read on phone B (proves native
AES matches); shared edit both ways; unshare, then check the partner can't open later
edits; remove a lock; partner on an old build is rejected by the constraint; the
Supabase dashboard shows blank `title`/`body` for locked notes.

## Rollout

1. Run the new `schema.sql` section in the Supabase SQL editor (additive; old builds unaffected until a row has `ciphertext`).
2. Compute the fingerprint in the **main checkout** and compare it to the installed
   build (`91cc32d7…` as of 2026-10-01). Then run `npm run ota`.
3. Both phones open DuoNotes: keys are created, public keys published, and existing locked notes encrypt.
4. Compare the safety code once.
5. Spot-check the dashboard.

## Open risks

- **`expo-crypto` AES interop:** confirm native AES-GCM output opens under WebCrypto,
  covered by the device checklist. If it doesn't, the fallback is `@noble/ciphers`
  (pure JS) for AES as well.
- **Large notes:** AES over a multi-MB body with photos runs on every autosave. Measure
  on device; if it is slow, debounce encryption separately from the UI.
