import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const PIN_LENGTH = 4;

interface PinModalProps {
  visible: boolean;
  /** 'set' asks the user to enter then confirm a new PIN; 'verify' checks one. */
  mode: 'set' | 'verify';
  title: string;
  /** Called with the entered PIN. Return true if accepted, false to reject (verify mode). */
  onSubmit: (pin: string) => Promise<boolean> | boolean;
  onCancel: () => void;
}

export function PinModal({ visible, mode, title, onSubmit, onCancel }: PinModalProps) {
  const theme = useTheme();
  const [entry, setEntry] = useState('');
  const [firstPass, setFirstPass] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the modal opens/closes.
  useEffect(() => {
    if (!visible) {
      setEntry('');
      setFirstPass(null);
      setError(null);
    }
  }, [visible]);

  const confirming = mode === 'set' && firstPass !== null;
  const subtitle = confirming ? 'Re-enter your PIN to confirm' : `Enter a ${PIN_LENGTH}-digit PIN`;

  async function commit(pin: string) {
    if (mode === 'set') {
      if (firstPass === null) {
        setFirstPass(pin);
        setEntry('');
        return;
      }
      if (firstPass !== pin) {
        setError("Those didn't match. Start again.");
        setFirstPass(null);
        setEntry('');
        return;
      }
    }
    const ok = await onSubmit(pin);
    if (!ok) {
      setError('Incorrect PIN. Try again.');
      setEntry('');
    }
  }

  function press(digit: string) {
    setError(null);
    const next = entry + digit;
    setEntry(next);
    if (next.length === PIN_LENGTH) {
      // Defer so the last dot renders before we act.
      setTimeout(() => commit(next), 80);
    }
  }

  function backspace() {
    setError(null);
    setEntry((e) => e.slice(0, -1));
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <ThemedView style={styles.container}>
        <View style={styles.top}>
          <Pressable onPress={onCancel} hitSlop={12} style={styles.cancel}>
            <ThemedText type="link" style={{ color: theme.accent }}>
              Cancel
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.content}>
          <Ionicons name="lock-closed" size={32} color={theme.text} />
          <ThemedText type="subtitle" style={styles.title}>
            {title}
          </ThemedText>
          <ThemedText themeColor="textSecondary">{subtitle}</ThemedText>

          <View style={styles.dots}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { borderColor: theme.textSecondary },
                  i < entry.length && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
              />
            ))}
          </View>

          <ThemedText type="small" style={[styles.error, { color: error ? '#E5484D' : 'transparent' }]}>
            {error ?? '·'}
          </ThemedText>

          <View style={styles.pad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, i) => {
              if (key === '') return <View key={i} style={styles.key} />;
              const isBksp = key === '⌫';
              return (
                <Pressable
                  key={i}
                  onPress={() => (isBksp ? backspace() : press(key))}
                  style={({ pressed }) => [
                    styles.key,
                    { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
                    isBksp && { backgroundColor: 'transparent' },
                  ]}>
                  {isBksp ? (
                    <Ionicons name="backspace-outline" size={24} color={theme.text} />
                  ) : (
                    <ThemedText style={styles.keyText}>{key}</ThemedText>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </ThemedView>
    </Modal>
  );
}

const KEY_SIZE = 72;

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Spacing.six },
  top: { paddingHorizontal: Spacing.four, height: 44, justifyContent: 'center' },
  cancel: { alignSelf: 'flex-start' },
  content: { flex: 1, alignItems: 'center', paddingTop: Spacing.four, gap: Spacing.two },
  title: { marginTop: Spacing.two },
  dots: { flexDirection: 'row', gap: Spacing.three, marginVertical: Spacing.four },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  error: { height: 20 },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: KEY_SIZE * 3 + Spacing.three * 2,
    gap: Spacing.three,
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: 28, lineHeight: 34, fontWeight: '500', textAlign: 'center' },
});
