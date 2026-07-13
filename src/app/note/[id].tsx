import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  MarkdownTextInput,
  type MarkdownStyle,
  parseExpensiMark,
} from '@expensify/react-native-live-markdown';

import { FormatToolbar } from '@/components/format-toolbar';
import { LinkPartnerSheet } from '@/components/link-partner-sheet';
import { PinModal } from '@/components/pin-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useNotes } from '@/context/notes-context';
import { useTheme } from '@/hooks/use-theme';
import {
  authenticateBiometric,
  getBiometricStatus,
  isPinSet,
  setPin,
  verifyPin,
} from '@/lib/security';
import { type Edit } from '@/lib/markdown';
import type { LockType } from '@/lib/types';

/** Body line height, shared by the text and the ruled-paper background lines. */
const LINE_HEIGHT = 26;

export default function NoteEditorScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getNote, updateNote, deleteNote, toggleShared, setLock, loading } = useNotes();
  const { user } = useAuth();

  const note = getNote(id);

  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [unlocked, setUnlocked] = useState(note ? note.lockType === 'none' : true);
  // `pinTask` drives the shared PinModal for either unlocking or enabling a PIN.
  const [pinTask, setPinTask] = useState<'unlock' | 'enable' | null>(null);
  // Live selection for the formatting toolbar; `caret` is a one-shot controlled
  // selection used only to reposition the cursor right after a toolbar edit.
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [caret, setCaret] = useState<{ start: number; end: number } | undefined>(undefined);
  // Invite/link-partner sheet, opened when you share without a partner linked.
  const [showLink, setShowLink] = useState(false);

  const locked = note ? note.lockType !== 'none' : false;

  // If the note was deleted (or never existed), leave — but only once notes
  // have finished loading, so we don't bounce during the initial fetch.
  useEffect(() => {
    if (!loading && !note) router.back();
  }, [loading, note, router]);

  // Sync local fields when a (different) note becomes available. Keyed on the
  // id only, so realtime refreshes of the same note never clobber typing.
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setBody(note.body);
      setUnlocked(note.lockType === 'none');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  // Debounce writes so we don't hit the database on every keystroke.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ title?: string; body?: string }>({});

  const flush = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (Object.keys(pending.current).length > 0) {
      updateNote(id, pending.current);
      pending.current = {};
    }
  }, [id, updateNote]);

  const persist = useCallback(
    (patch: { title?: string; body?: string }) => {
      pending.current = { ...pending.current, ...patch };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flush, 700);
    },
    [flush],
  );

  // Flush any pending edit when leaving the screen.
  useEffect(() => flush, [flush]);

  const tryBiometric = useCallback(async () => {
    const ok = await authenticateBiometric('Unlock this note');
    if (ok) setUnlocked(true);
  }, []);

  // Auto-prompt biometrics as soon as a biometric-locked note opens.
  useEffect(() => {
    if (note && note.lockType === 'biometric' && !unlocked) {
      tryBiometric();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  // `note` is narrowed to non-null below. These handlers are `const` arrows (not
  // hoisted `function` declarations) so the narrowing flows into their closures.
  if (!note) return null;
  const activeNote = note;

  const changeBody = (t: string) => {
    setBody(t);
    persist({ body: t });
  };

  // Apply a formatting-toolbar edit, then drop the caret where it belongs.
  const onApplyFormat = (edit: Edit) => {
    changeBody(edit.text);
    setSelection({ start: edit.cursor, end: edit.cursor });
    setCaret({ start: edit.cursor, end: edit.cursor });
  };

  // The people icon: if there's no partner yet, invite one first; otherwise
  // just toggle sharing.
  const onSharePress = () => {
    if (!activeNote.isShared && !user?.partnerId) {
      setShowLink(true);
      return;
    }
    toggleShared(activeNote.id);
  };

  const applyLock = async (type: LockType) => {
    await setLock(activeNote.id, type);
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
    const options: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [
      { text: activeNote.lockType === 'pin' ? '🔒 PIN lock (on)' : 'PIN lock', onPress: enablePinLock },
      {
        text: activeNote.lockType === 'biometric' ? '🔒 Biometric lock (on)' : 'Biometric lock',
        onPress: enableBiometricLock,
      },
    ];
    if (activeNote.lockType !== 'none') {
      options.push({ text: 'Remove lock', style: 'destructive', onPress: () => applyLock('none') });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Lock note', 'Keep this note hidden until it is unlocked.', options);
  };

  const confirmDelete = () => {
    Alert.alert('Delete note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteNote(activeNote.id);
          router.back();
        },
      },
    ]);
  };

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

  // Live-formatting styles: dim the syntax marks, enlarge headings, style code.
  const mdStyle: MarkdownStyle = {
    syntax: { color: theme.textSecondary },
    h1: { fontSize: 24 },
    link: { color: '#3c87f7' },
    code: {
      color: theme.text,
      backgroundColor: theme.backgroundElement,
    },
    blockquote: {
      borderColor: theme.backgroundSelected,
      borderWidth: 4,
      marginLeft: 6,
      paddingLeft: 8,
    },
  };

  const lockIcon = note.lockType === 'biometric' ? 'finger-print' : 'lock-closed';
  const isShared = note.isShared;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerLeft}>
            <Ionicons name="chevron-back" size={24} color="#3c87f7" />
            <ThemedText type="link" style={{ color: '#3c87f7' }}>
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
        ) : (
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {/* Toolbar pinned at the top so the keyboard never covers it. */}
            <FormatToolbar value={body} selection={selection} onApply={onApplyFormat} />
            <ScrollView contentContainerStyle={styles.editor} keyboardShouldPersistTaps="handled">
              <TextInput
                value={title}
                onChangeText={(t) => {
                  setTitle(t);
                  persist({ title: t });
                }}
                placeholder="Title"
                placeholderTextColor={theme.textSecondary}
                style={[styles.titleInput, { color: theme.text }]}
                multiline
              />
              {isShared && (
                <View style={styles.sharedBanner}>
                  <Ionicons name="people" size={14} color={theme.textSecondary} />
                  <ThemedText type="small" themeColor="textSecondary">
                    Shared with your partner
                  </ThemedText>
                </View>
              )}
              <View style={styles.paper}>
                <RuledLines color={theme.backgroundSelected} />
                <MarkdownTextInput
                  value={body}
                  onChangeText={changeBody}
                  parser={parseExpensiMark}
                  markdownStyle={mdStyle}
                  selection={caret}
                  onSelectionChange={(e) => {
                    setSelection(e.nativeEvent.selection);
                    if (caret) setCaret(undefined);
                  }}
                  placeholder="Start writing…"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.bodyInput, { color: theme.text }]}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>

      <PinModal
        visible={pinTask !== null}
        mode={pinTask === 'enable' ? 'set' : 'verify'}
        title={pinTask === 'enable' ? 'Set a PIN' : 'Enter your PIN'}
        onSubmit={onPinModalSubmit}
        onCancel={() => setPinTask(null)}
      />

      <LinkPartnerSheet
        visible={showLink}
        onClose={() => setShowLink(false)}
        onLinked={() => {
          if (!activeNote.isShared) toggleShared(activeNote.id);
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
        <Ionicons name={name} size={22} color={active ? '#3c87f7' : theme.text} />
      </Pressable>
    );
  }
}

/** Faint horizontal rules behind the note body for a journal / ruled-paper feel.
 *  Spaced to match the body line height; non-interactive so taps hit the text. */
function RuledLines({ color }: { color: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 80 }).map((_, i) => (
        <View
          key={i}
          style={{ height: LINE_HEIGHT, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color }}
        />
      ))}
    </View>
  );
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
        style={({ pressed }) => [styles.unlockButton, { opacity: pressed ? 0.8 : 1 }]}>
        <Ionicons name={isBio ? 'finger-print' : 'keypad'} size={20} color="#fff" />
        <ThemedText style={styles.unlockText}>Unlock</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  flex: { flex: 1 },
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
  editor: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.two },
  titleInput: { fontSize: 26, fontWeight: '700', paddingTop: Spacing.two },
  sharedBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  paper: { position: 'relative', minHeight: 320, overflow: 'hidden' },
  bodyInput: { fontSize: 17, lineHeight: LINE_HEIGHT, minHeight: 320, padding: 0 },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  gateText: { textAlign: 'center' },
  unlockButton: {
    marginTop: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: '#3c87f7',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 2,
    borderRadius: Spacing.three,
  },
  unlockText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
