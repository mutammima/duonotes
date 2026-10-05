import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmModal } from '@/components/confirm-modal';
import { LinkPartnerSheet } from '@/components/link-partner-sheet';
import { PinModal } from '@/components/pin-modal';
import { RichNoteEditor } from '@/components/rich-note-editor';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { accentFromHue, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useNotes } from '@/context/notes-context';
import { useAccentHue } from '@/context/theme-context';
import { useNotePresence } from '@/hooks/use-note-presence';
import { useTheme } from '@/hooks/use-theme';
import { E2eeError, type NotePlain } from '@/lib/e2ee/envelope';
import { isEncrypted } from '@/lib/note-rows';
import { setLockedNotePrivacy } from '@/lib/privacy-screen';
import {
  authenticateBiometric,
  getBiometricStatus,
  isPinSet,
  setPin,
  verifyPin,
} from '@/lib/security';
import type { LockType } from '@/lib/types';

/**
 * How long after a local title keystroke we refuse to adopt the synced title.
 * Comfortably longer than the 300ms save debounce plus the round trip back
 * through the notes context, so our own in-flight edit is never mistaken for a
 * partner's and reverted.
 */
const TITLE_ADOPT_GRACE_MS = 1500;

type PendingEdit = { title?: string; body?: string };

/** What is still unsaved once `saved` has landed: fields typed over since keep their newer value. */
function withoutSaved(pending: PendingEdit, saved: PendingEdit): PendingEdit {
  const next = { ...pending };
  for (const k of Object.keys(saved) as (keyof PendingEdit)[]) {
    if (next[k] === saved[k]) delete next[k];
  }
  return next;
}

function openErrorText(reason: string, ownerName: string): string {
  switch (reason) {
    case 'no-key':
      return `🔒 Waiting for ${ownerName}'s phone to share the key. This opens by itself once their phone is online.`;
    case 'decrypt-failed':
      return "This note can't be opened on this phone: the key doesn't match or the data is damaged.";
    case 'malformed':
      return "This note can't be opened on this phone: the data is damaged.";
    case 'unsupported-version':
      return "This note can't be opened on this phone: it was saved by a newer DuoNotes. Update the app.";
    default:
      return "This note can't be opened on this phone.";
  }
}

/** Short reason for a failed share/lock change (the context rejects with an E2eeError or a plain Error). */
function updateErrorText(e: unknown): string {
  if (e instanceof E2eeError) {
    return e.code === 'no-key'
      ? "The note changed meanwhile, or its key isn't on this phone. Try again in a moment."
      : "This note can't be opened on this phone.";
  }
  return 'Something went wrong. Try again.';
}

function showUpdateError(e: unknown) {
  Alert.alert("Couldn't update this note", updateErrorText(e));
}

export default function NoteEditorScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    getNote,
    updateNote,
    deleteNote,
    toggleShared,
    setLock,
    loading,
    markSeen,
    opened,
    openLocked,
    closeLocked,
  } = useNotes();
  const { user } = useAuth();

  const note = getNote(id);
  const encrypted = note ? isEncrypted(note) : false;
  // For an encrypted note, `note.title`/`note.body` are always '' and the real
  // text is in the session-only `opened` map, filled after the gate passes. A
  // plain note always reads its own fields, so a stale `opened` entry left over
  // from before its lock was removed is never shown.
  const openedPlain = opened[id];
  const plain = useMemo<NotePlain | undefined>(
    () => (encrypted ? openedPlain : note ? { title: note.title, body: note.body } : undefined),
    [encrypted, openedPlain, note],
  );
  // Which note's text the local fields hold. The editor only reads `initialHtml`
  // when it mounts, so an encrypted note keeps showing "Opening…" until its
  // decrypted text has been copied into `body` (see the seeding effect below).
  const [seededId, setSeededId] = useState<string | null>(note && !isEncrypted(note) ? id : null);
  // The last failed open, tagged with the key and ciphertext it was attempted
  // at, so a retry under a new wrap or version shows "Opening…" rather than
  // the old failure.
  const [openFailure, setOpenFailure] = useState<{
    wrap: string | undefined;
    ciphertext: string | null | undefined;
    text: string;
  } | null>(null);
  const [saveError, setSaveError] = useState(false);
  const myWrap = user ? note?.noteKeys?.[user.id] : undefined;
  const ciphertext = note?.ciphertext;
  const openError =
    openFailure && openFailure.wrap === myWrap && openFailure.ciphertext === ciphertext
      ? openFailure.text
      : null;

  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  // Closed while the note is still loading: in the commit where it arrives, the
  // effects below still read this initial value, and an encrypted note must not
  // be decrypted before its gate. An unlocked note is set open by the id effect.
  const [unlocked, setUnlocked] = useState(note ? note.lockType === 'none' : false);
  // `pinTask` drives the shared PinModal for either unlocking or enabling a PIN.
  const [pinTask, setPinTask] = useState<'unlock' | 'enable' | null>(null);
  // Invite/link-partner sheet, opened when you share without a partner linked.
  const [showLink, setShowLink] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const myHue = useAccentHue();
  const { partner: partnerHere, reportTyping } = useNotePresence(
    note?.isShared ? id : undefined,
    myHue,
  );

  const locked = note ? note.lockType !== 'none' : false;

  // If the note was deleted (or never existed), leave — but only once notes
  // have finished loading, so we don't bounce during the initial fetch.
  useEffect(() => {
    if (!loading && !note) router.back();
  }, [loading, note, router]);

  // While this note is open you're by definition looking at it, so keep it
  // marked read — including when a partner edit lands mid-view.
  useEffect(() => {
    if (note) markSeen(id);
  }, [id, note?.updatedAt, markSeen, note]);

  // Sync local fields when a (different) note becomes available. Keyed on the
  // id only, so realtime refreshes of the same note never clobber typing.
  //
  // The BODY is separately kept live by RichNoteEditor's `remoteHtml`, which
  // installs a partner's revision whenever the caret is elsewhere. `body` here
  // stays the local mirror used for saving.
  //
  // An encrypted note's own fields are always '', so it is seeded from its
  // decrypted text instead, once the gate has passed (see below).
  useEffect(() => {
    if (note) {
      if (!isEncrypted(note)) {
        setTitle(note.title);
        setBody(note.body);
        setSeededId(note.id);
      }
      setUnlocked(note.lockType === 'none');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  // Re-lock when the user genuinely leaves the app — 'background', never
  // 'inactive'.
  //
  // This deliberately no longer tries to also be the app-switcher cover. The
  // previous version fired on any non-'active' state to beat the snapshot, but
  // the system Face ID sheet ALSO makes the app 'inactive': unlocking the note
  // immediately re-locked it, and combined with the whole-app gate the two
  // could bounce off each other so the note could never be opened at all.
  // Hiding the content from the switcher is now the native privacy cover's job
  // (src/lib/privacy-screen.ts), which is race-free; this listener is purely
  // about *authorization*, so 'background' is the correct — and safe — signal.
  useEffect(() => {
    if (!locked) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') setUnlocked(false);
    });
    return () => sub.remove();
  }, [locked]);

  // While a locked note is actually readable on screen, harden the window
  // itself: this is the layer that covers a *presented* screen (note/[id] is a
  // native modal, which the app-switcher blur alone slides underneath), and it
  // also keeps locked content out of screenshots. Released as soon as the note
  // closes or re-locks, so ordinary screens stay screenshot-able.
  useEffect(() => {
    const shouldHarden = locked && unlocked;
    setLockedNotePrivacy(shouldHarden);
    return () => {
      if (shouldHarden) setLockedNotePrivacy(false);
    };
  }, [locked, unlocked]);

  // The OTHER half of "re-lock when I leave" — navigating back to the list —
  // is already covered without extra code: `note/[id]` is pushed as a modal
  // stack screen, which unmounts on pop, and `unlocked`'s initial value
  // (above) is computed fresh from `note.lockType` on every mount. Verified
  // on-device: unlock a note, back out to the list, back in — locked again.

  // Debounce writes so we don't hit the database on every keystroke.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<PendingEdit>({});
  // Each flush's recovery waits for the one before it, so two failed saves
  // never race each other to reopen the note.
  const flushChain = useRef<Promise<void>>(Promise.resolve());
  // True while this screen holds an encrypted note open (gate passed, screen
  // mounted). A save recovered after leaving closes the note again behind it.
  const holdingOpenRef = useRef(false);

  // Resolves once the edit is saved or has definitively failed; never rejects.
  // `pending` is cleared only by a save that landed, so a refused save keeps the
  // typed text queued (and on screen) instead of dropping it.
  const flush = useCallback((): Promise<void> => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return flushChain.current;
    // Called now, not after the chain: the note's write queue then holds this
    // save ahead of a `closeLocked` issued right after (leaving the screen).
    // Settled to a boolean at once, so a refusal is never an unhandled rejection
    // while it waits behind an earlier flush's recovery.
    const attempt = updateNote(id, patch).then(
      () => true,
      () => false,
    );
    const run = flushChain.current.then(async () => {
      if (await attempt) {
        pending.current = withoutSaved(pending.current, patch);
        setSaveError(false);
        return;
      }
      // Refused: an encrypted note that isn't open, or whose ciphertext or keys
      // changed underneath it (a partner's edit, a re-key, a lock change).
      // An earlier flush's retry may already have saved everything.
      if (Object.keys(pending.current).length === 0) {
        setSaveError(false);
        return;
      }
      // Reopen once at the current version and save again, with anything typed
      // since merged in. The banner goes up only if that fails too, so an
      // ordinary collision (a partner's edit landing mid-save) never flashes it.
      const reopened = await openLocked(id);
      if (!reopened.ok) {
        setSaveError(true);
        return;
      }
      const retry = pending.current;
      const saved = await updateNote(id, retry).then(
        () => true,
        () => false,
      );
      if (saved) {
        pending.current = withoutSaved(pending.current, retry);
        setSaveError(false);
      } else {
        // Still refused: the banner tells the user, and the edit stays pending.
        setSaveError(true);
      }
      if (!holdingOpenRef.current) closeLocked(id);
    });
    flushChain.current = run;
    return run;
  }, [id, updateNote, openLocked, closeLocked]);

  const persist = useCallback(
    (patch: { title?: string; body?: string }) => {
      pending.current = { ...pending.current, ...patch };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      // Short debounce so edits reach the server (and the partner) quickly
      // without hammering the DB on every keystroke.
      saveTimer.current = setTimeout(flush, 300);
    },
    [flush],
  );

  // Flush any pending edit when leaving the screen.
  useEffect(() => () => void flush(), [flush]);

  // Decrypt once the PIN/Face ID gate has passed, and again whenever the open
  // text goes missing while the gate is open: the note was just sealed (by a
  // lock or background maintenance), or a refresh dropped it. `myWrap` is in the
  // deps so a note that was "waiting for the key" opens by itself the moment
  // the other phone's wrap syncs in; `ciphertext` so a new version is tried.
  const hasPlain = plain !== undefined;
  const ownerName = note?.ownerName ?? 'your partner';
  const openSeqRef = useRef(0);
  useEffect(() => {
    if (!encrypted || !unlocked || hasPlain) return;
    const seq = ++openSeqRef.current;
    const at = { wrap: myWrap, ciphertext };
    openLocked(id).then((r) => {
      if (seq !== openSeqRef.current) return; // a newer attempt owns the outcome
      setOpenFailure(r.ok ? null : { ...at, text: openErrorText(r.reason, ownerName) });
    });
  }, [encrypted, unlocked, hasPlain, id, myWrap, ciphertext, ownerName, openLocked]);

  // Hold the decrypted text only while the gate is open. Leaving the screen,
  // re-locking in the background, or the lock being removed hands it back. The
  // pending edit is flushed first so it is queued ahead of the close and saved
  // under the key it was typed for.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(() => {
    if (!encrypted || !unlocked) return;
    holdingOpenRef.current = true;
    return () => {
      holdingOpenRef.current = false;
      void flushRef.current();
      closeLocked(id);
    };
  }, [encrypted, unlocked, id, closeLocked]);

  // True while this screen is mounted with its gate open. A Lock started here
  // creates the open entry only when sealing finishes; if by then the user has
  // left (or the app re-locked), the hold effect above never ran for it, so the
  // entry is closed by `applyLock` instead.
  const screenOpenRef = useRef(false);
  useEffect(() => {
    screenOpenRef.current = unlocked;
    return () => {
      screenOpenRef.current = false;
    };
  }, [unlocked]);

  // Seed the fields the first time the decrypted text arrives — never over
  // text the user typed and hasn't saved yet, and never behind a closed gate.
  useEffect(() => {
    if (locked && !unlocked) return;
    if (!encrypted || !plain || seededId === id) return;
    setSeededId(id);
    if (Object.keys(pending.current).length > 0) return;
    setTitle(plain.title);
    setBody(plain.body);
  }, [locked, unlocked, encrypted, plain, id, seededId]);

  // Adopt the partner's title, under the same rule as the body: never over a
  // field you are in.
  //
  // The extra guards exist because a stale `note.title` is ambiguous — it looks
  // identical whether the partner hasn't typed or OUR OWN save simply hasn't
  // landed yet, and adopting in the second case would silently eat what we just
  // typed. `pending` covers the window before the debounce fires; the grace
  // period covers the render or two between `updateNote` and `note` coming back
  // holding our value.
  //
  // `plain` is undefined while an encrypted note's text isn't open, so a note
  // that was just sealed (its own title now '') is never mistaken for an empty one.
  // Nothing is copied in behind a closed gate; unlocking re-runs the check.
  const lastTitleEditRef = useRef(0);
  useEffect(() => {
    if (locked && !unlocked) return;
    if (!plain || titleFocused) return;
    if (plain.title === title) return;
    if (pending.current.title !== undefined) return;
    if (Date.now() - lastTitleEditRef.current < TITLE_ADOPT_GRACE_MS) return;
    setTitle(plain.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plain?.title, titleFocused, locked, unlocked]);

  // Set once the user actively dismisses a biometric prompt, so we never
  // re-prompt them in a loop they can't escape. Cleared when they ask again.
  const declinedRef = useRef(false);

  const tryBiometric = useCallback(async () => {
    declinedRef.current = false;
    const ok = await authenticateBiometric('Unlock this note');
    if (ok) setUnlocked(true);
    else declinedRef.current = true;
  }, []);

  // Counts genuine returns from the background, so a re-locked note can
  // re-prompt. Keyed on 'background' (not 'inactive') for the same reason as
  // the re-lock above: the Face ID sheet itself makes the app 'inactive', and
  // treating that as a return would re-prompt on top of the live prompt.
  const [resumeToken, setResumeToken] = useState(0);
  useEffect(() => {
    let wasBackgrounded = false;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') wasBackgrounded = true;
      else if (next === 'active' && wasBackgrounded) {
        wasBackgrounded = false;
        setResumeToken((t) => t + 1);
      }
    });
    return () => sub.remove();
  }, []);

  // Auto-prompt biometrics when a biometric-locked note opens, and again after
  // a real return from the background — but never after the user declined,
  // which is what would otherwise make the prompt impossible to dismiss.
  useEffect(() => {
    if (note?.lockType === 'biometric' && !unlocked && !declinedRef.current) {
      tryBiometric();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, resumeToken]);

  // `note` is narrowed to non-null below. These handlers are `const` arrows (not
  // hoisted `function` declarations) so the narrowing flows into their closures.
  if (!note) return null;
  const activeNote = note;

  const changeBody = (t: string) => {
    setBody(t);
    persist({ body: t });
    reportTyping();
  };

  // While the gate is closed, the header's share and lock actions only ask for
  // the PIN / Face ID: with encryption, both use the note's key (Remove lock
  // writes the decrypted text out), so neither may run without unlocking first.
  // After unlocking, the user taps again.
  const gated = locked && !unlocked;
  const requestUnlock = () => {
    if (activeNote.lockType === 'biometric') void tryBiometric();
    else setPinTask('unlock');
  };

  // The people icon: if there's no partner yet, invite one first; otherwise
  // just toggle sharing.
  const onSharePress = () => {
    if (gated) {
      requestUnlock();
      return;
    }
    if (!activeNote.isShared && !user?.partnerId) {
      setShowLink(true);
      return;
    }
    void toggleSharing();
  };

  // Never rejects. Sharing or unsharing an encrypted note re-wraps or re-keys it,
  // which can be refused (the key isn't here, or the note changed meanwhile).
  const toggleSharing = async () => {
    await flush();
    try {
      await toggleShared(activeNote.id);
    } catch (e) {
      showUpdateError(e);
    }
  };

  // Never rejects; reports a refused change itself. The typed-but-unsaved text
  // is saved first, so it is included in what gets sealed (or unsealed).
  const applyLock = async (type: LockType) => {
    await flush();
    try {
      await setLock(activeNote.id, type);
    } catch (e) {
      showUpdateError(e);
      return;
    }
    if (type !== 'none' && !screenOpenRef.current) closeLocked(activeNote.id);
  };

  const enablePinLock = async () => {
    if (await isPinSet()) {
      await applyLock('pin');
    } else {
      // No device PIN yet — collect one, then lock.
      setPinTask('enable');
    }
  };

  const enableBiometricLock = async () => {
    const status = await getBiometricStatus();
    if (!status.available) {
      Alert.alert('Not available', 'This device has no biometric sensor.');
      return;
    }
    if (!status.enrolled) {
      Alert.alert(
        `${status.label} not set up`,
        `Add ${status.label} in your system settings first, then try again.`,
      );
      return;
    }
    const ok = await authenticateBiometric(`Confirm ${status.label} to lock this note`);
    if (ok) await applyLock('biometric');
  };

  const chooseLock = () => {
    if (gated) {
      requestUnlock();
      return;
    }
    const options: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [
      { text: activeNote.lockType === 'pin' ? '🔒 PIN lock (on)' : 'PIN lock', onPress: enablePinLock },
      {
        text: activeNote.lockType === 'biometric' ? '🔒 Biometric lock (on)' : 'Biometric lock',
        onPress: enableBiometricLock,
      },
    ];
    if (activeNote.lockType !== 'none') {
      options.push({ text: 'Remove lock', style: 'destructive', onPress: () => void applyLock('none') });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Lock note', 'Keep this note hidden until it is unlocked.', options);
  };

  const confirmDelete = () => setDeleting(true);

  const onPinModalSubmit = async (pin: string): Promise<boolean> => {
    if (pinTask === 'unlock') {
      const ok = await verifyPin(pin);
      if (ok) {
        setUnlocked(true);
        setPinTask(null);
      }
      return ok;
    }
    if (pinTask === 'enable') {
      await setPin(pin);
      await applyLock('pin');
      setPinTask(null);
      return true;
    }
    return false;
  };

  const lockIcon = note.lockType === 'biometric' ? 'finger-print' : 'lock-closed';
  const isShared = note.isShared;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerLeft}>
            <Ionicons name="chevron-back" size={24} color={theme.accent} />
            <ThemedText type="link" style={{ color: theme.accent }}>
              Notes
            </ThemedText>
          </Pressable>

          <View style={styles.headerRight}>
            <HeaderIcon
              name={isShared ? 'people' : 'people-outline'}
              active={isShared}
              onPress={onSharePress}
            />
            <HeaderIcon
              name={locked ? lockIcon : 'lock-open-outline'}
              active={locked}
              onPress={chooseLock}
            />
            <HeaderIcon name="trash-outline" onPress={confirmDelete} />
          </View>
        </View>

        {/* Body */}
        {locked && !unlocked ? (
          <LockGate
            lockType={note.lockType}
            onUnlock={() => (note.lockType === 'biometric' ? tryBiometric() : setPinTask('unlock'))}
          />
        ) : encrypted && (seededId !== id || (!plain && openError)) ? (
          // Decrypting, or it can't be opened here. Once the fields are seeded the
          // editor stays up while a re-open is in flight (the text was already on
          // screen), and gives way only if that re-open fails.
          <View style={styles.openState}>
            <Ionicons
              name={openError ? 'alert-circle-outline' : 'lock-open-outline'}
              size={28}
              color={theme.textSecondary}
            />
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              {openError ?? 'Opening…'}
            </ThemedText>
          </View>
        ) : (
          <RichNoteEditor
            initialHtml={body}
            onChangeHtml={changeBody}
            // Only shared notes have a second author, so only they can receive
            // a revision from anyone else.
            remoteHtml={isShared ? plain?.body : undefined}>
            <View style={styles.editorHead}>
              <TextInput
                value={title}
                onChangeText={(t) => {
                  setTitle(t);
                  persist({ title: t });
                  lastTitleEditRef.current = Date.now();
                  reportTyping();
                }}
                onFocus={() => setTitleFocused(true)}
                onBlur={() => {
                  setTitleFocused(false);
                  flush();
                }}
                placeholder="Title"
                placeholderTextColor={theme.textSecondary}
                style={[styles.titleInput, { color: theme.text }]}
                multiline
              />
              {isShared && (
                <View style={styles.sharedBanner}>
                  <Ionicons name="heart" size={14} color={theme.accent} />
                  <ThemedText type="small" themeColor="textSecondary">
                    Shared with your partner
                  </ThemedText>
                </View>
              )}
              {saveError && (
                <ThemedText type="small" style={{ color: '#E5484D' }}>
                  {"Couldn't encrypt your last change, so it wasn't saved. Try again."}
                </ThemedText>
              )}
              {partnerHere && (
                // Their theme colour, not yours — so it reads as "them".
                <View style={styles.sharedBanner}>
                  <View
                    style={[styles.presenceDot, { backgroundColor: accentFromHue(partnerHere.hue) }]}
                  />
                  <ThemedText type="small" style={{ color: accentFromHue(partnerHere.hue) }}>
                    {partnerHere.typing
                      ? `${partnerHere.name} is typing…`
                      : `${partnerHere.name} is viewing this note`}
                  </ThemedText>
                </View>
              )}
            </View>
          </RichNoteEditor>
        )}
      </SafeAreaView>

      <PinModal
        visible={pinTask !== null}
        mode={pinTask === 'enable' ? 'set' : 'verify'}
        title={pinTask === 'enable' ? 'Set a PIN' : 'Enter your PIN'}
        onSubmit={onPinModalSubmit}
        onCancel={() => setPinTask(null)}
      />

      <ConfirmModal
        visible={deleting}
        title="Delete note?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onCancel={() => setDeleting(false)}
        onConfirm={async () => {
          setDeleting(false);
          await deleteNote(activeNote.id);
          router.back();
        }}
      />

      <LinkPartnerSheet
        visible={showLink}
        onClose={() => setShowLink(false)}
        onLinked={() => {
          if (!activeNote.isShared) void toggleSharing();
        }}
        reason="Link your partner to share this note. Enter the email they signed up with — once linked, this note syncs to their phone."
      />
    </ThemedView>
  );

  function HeaderIcon({
    name,
    onPress,
    active,
  }: {
    name: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    active?: boolean;
  }) {
    return (
      <Pressable onPress={onPress} hitSlop={8} style={styles.headerIcon}>
        <Ionicons name={name} size={22} color={active ? theme.accent : theme.text} />
      </Pressable>
    );
  }
}

function LockGate({ lockType, onUnlock }: { lockType: LockType; onUnlock: () => void }) {
  const theme = useTheme();
  const isBio = lockType === 'biometric';
  return (
    <View style={styles.gate}>
      <Ionicons name={isBio ? 'finger-print' : 'lock-closed'} size={56} color={theme.textSecondary} />
      <ThemedText type="subtitle">This note is locked</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.gateText}>
        {isBio
          ? 'Use biometrics to view its contents.'
          : 'Enter your PIN to view its contents.'}
      </ThemedText>
      <Pressable
        onPress={onUnlock}
        style={({ pressed }) => [styles.unlockButton, { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}>
        <Ionicons name={isBio ? 'finger-print' : 'keypad'} size={20} color="#fff" />
        <ThemedText style={styles.unlockText}>Unlock</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  headerIcon: { padding: Spacing.two },
  editorHead: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.two },
  titleInput: { fontSize: 26, fontWeight: '700', paddingTop: Spacing.two },
  sharedBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  presenceDot: { width: 8, height: 8, borderRadius: 4 },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  gateText: { textAlign: 'center' },
  openState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  unlockButton: {
    marginTop: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 2,
    borderRadius: Spacing.three,
  },
  unlockText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
