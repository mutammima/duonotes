import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** PINs are a fixed 4 digits — the pad auto-submits on the 4th press. */
export const PIN_LENGTH = 4;

/**
 * Presentational PIN keypad: the filled/empty dots, an error line, and the
 * 12-key grid. Entry state and what to do on completion live in the caller
 * (the set/verify PinModal, and the app-lock screen) so this component stays
 * a dumb, shared renderer.
 */
export function PinPad({
  entry,
  subtitle,
  error,
  onDigit,
  onBackspace,
}: {
  entry: string;
  subtitle: string;
  error: string | null;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
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
              onPress={() => (isBksp ? onBackspace() : onDigit(key))}
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
  );
}

const KEY_SIZE = 72;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: Spacing.two },
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
