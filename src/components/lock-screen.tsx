import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { PIN_LENGTH, PinPad } from '@/components/pin-pad';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  authenticateBiometric,
  getBiometricStatus,
  isPinSet,
  verifyPin,
  type BiometricStatus,
} from '@/lib/security';

/**
 * Full-screen cover shown whenever the app is locked. Rendered as a Modal so
 * it sits above everything — the tab strip AND a presented note-editor modal —
 * which also means it's what iOS captures for the app-switcher snapshot.
 *
 *  - `foreground === false` (app is in the switcher / backgrounded): show just
 *    the pink splash art, so no note content leaks into the switcher preview.
 *  - `foreground === true` (user came back and must get in): show the unlock
 *    UI — auto-prompt biometrics, with the PIN pad as the fallback.
 */
export function LockScreen({
  foreground,
  promptToken,
  onUnlocked,
}: {
  foreground: boolean;
  promptToken: number;
  onUnlocked: () => void;
}) {
  const theme = useTheme();
  const [pinSet, setPinSet] = useState(false);
  const [bio, setBio] = useState<BiometricStatus | null>(null);
  const [entry, setEntry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const promptingRef = useRef(false);
  const lastPromptedToken = useRef(-1);

  useEffect(() => {
    isPinSet().then(setPinSet);
    getBiometricStatus().then(setBio);
  }, []);

  const runBiometric = useCallback(async () => {
    if (promptingRef.current) return;
    promptingRef.current = true;
    try {
      if (await authenticateBiometric('Unlock DuoNotes')) onUnlocked();
    } finally {
      promptingRef.current = false;
    }
  }, [onUnlocked]);

  // Auto-prompt Face ID / Touch ID once we're the foreground unlock screen —
  // once per `promptToken` (cold launch, then each real return from the
  // background), so the system sheet's own transient AppState blips don't loop.
  useEffect(() => {
    if (!foreground) return;
    if (bio?.available && bio?.enrolled && lastPromptedToken.current !== promptToken) {
      lastPromptedToken.current = promptToken;
      runBiometric();
    }
  }, [foreground, bio, promptToken, runBiometric]);

  function press(digit: string) {
    setError(null);
    const next = entry + digit;
    setEntry(next);
    if (next.length === PIN_LENGTH) {
      setTimeout(async () => {
        if (await verifyPin(next)) {
          setEntry('');
          onUnlocked();
        } else {
          setError('Incorrect PIN. Try again.');
          setEntry('');
        }
      }, 80);
    }
  }

  function backspace() {
    setError(null);
    setEntry((e) => e.slice(0, -1));
  }

  return (
    <Modal visible animationType="none" onRequestClose={() => {}}>
      {!foreground ? (
        <View style={styles.splash}>
          <Image style={styles.splashIcon} source={require('@/assets/images/splash-icon.png')} />
        </View>
      ) : (
        <ThemedView style={styles.unlock}>
          <View style={styles.unlockBody}>
            <Ionicons name="lock-closed" size={36} color={theme.text} />
            <ThemedText type="subtitle" style={styles.title}>
              DuoNotes is locked
            </ThemedText>

            {pinSet ? (
              <PinPad
                entry={entry}
                subtitle="Enter your PIN to unlock"
                error={error}
                onDigit={press}
                onBackspace={backspace}
              />
            ) : (
              <ThemedText themeColor="textSecondary" style={styles.hint}>
                Use {bio?.label ?? 'biometrics'} to unlock.
              </ThemedText>
            )}

            {bio?.available && (
              <Pressable
                onPress={runBiometric}
                style={({ pressed }) => [
                  styles.bioButton,
                  { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
                ]}>
                <Ionicons name="scan-outline" size={20} color={theme.accent} />
                <ThemedText style={{ color: theme.accent, fontWeight: '600' }}>
                  Unlock with {bio.label}
                </ThemedText>
              </Pressable>
            )}
          </View>
        </ThemedView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#FFA5C3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashIcon: { width: 96, height: 96 },
  unlock: { flex: 1, paddingTop: Spacing.six },
  unlockBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingBottom: Spacing.six },
  title: { marginBottom: Spacing.two },
  hint: { marginVertical: Spacing.four },
  bioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
    marginTop: Spacing.two,
  },
});
