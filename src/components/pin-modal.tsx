import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { PIN_LENGTH, PinPad } from '@/components/pin-pad';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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

          <PinPad
            entry={entry}
            subtitle={subtitle}
            error={error}
            onDigit={press}
            onBackspace={backspace}
          />
        </View>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Spacing.six },
  top: { paddingHorizontal: Spacing.four, height: 44, justifyContent: 'center' },
  cancel: { alignSelf: 'flex-start' },
  content: { flex: 1, alignItems: 'center', paddingTop: Spacing.four, gap: Spacing.two },
  title: { marginTop: Spacing.two },
});
