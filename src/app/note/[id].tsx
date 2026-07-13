import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

import { PinModal } from '@/components/pin-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useNotes } from '@/context/notes-context';
import { useTheme } from '@/hooks/use-theme';
import {
  authenticateBiometric,
  getBiometricStatus,
  isPinSet,
  setPin,
  verifyPin,
} from '@/lib/security';
import type { LockType } from '@/lib/types';

export default function NoteEditorScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getNote, updateNote, deleteNote, toggleShared, setLock } = useNotes();

  const note = getNote(id);

  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [unlocked, setUnlocked] = useState(note ? note.lockType === 'none' : true);
  // `pinTask` drives the shared PinModal for either unlocking or enabling a PIN.
  const [pinTask, setPinTask] = useState<'unlock' | 'enable' | null>(null);

  const locked = note ? note.lockType !== 'none' : false;

  // If the note was deleted out from under us, leave.
  useEffect(() => {
    if (!note) router.back();
  }, [note, router]);

  const persist = useCallback(
    (patch: { title?: string; body?: string }) => {
      if (note) updateNote(note.id, patch);
    },
    [note, updateNote],
  );

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

  const lockIcon = note.lockType === 'biometric' ? 'finger-print' : 'lock-closed';
  const isShared = note.sharedWith.length > 0;

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
              onPress={() => toggleShared(note.id)}
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
              <TextInput
                value={body}
                onChangeText={(t) => {
                  setBody(t);
                  persist({ body: t });
                }}
                placeholder="Start writing…"
                placeholderTextColor={theme.textSecondary}
                style={[styles.bodyInput, { color: theme.text }]}
                multiline
                textAlignVertical="top"
              />
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
  bodyInput: { fontSize: 17, lineHeight: 26, minHeight: 240 },
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
