import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';

/**
 * Bottom sheet to link a partner by email — the same flow as Settings → Partner,
 * surfaced wherever it's needed (e.g. straight from a note when you try to share
 * without a partner linked yet). Calls `onLinked` once the link succeeds.
 */
export function LinkPartnerSheet({
  visible,
  onClose,
  onLinked,
  reason,
}: {
  visible: boolean;
  onClose: () => void;
  onLinked?: () => void;
  reason?: string;
}) {
  const theme = useTheme();
  const { linkPartner } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await linkPartner(email);
      setEmail('');
      onClose();
      onLinked?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not link that account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Stop taps inside the card from closing the sheet. */}
          <Pressable onPress={() => {}}>
            <ThemedView type="background" style={[styles.card, { borderColor: theme.backgroundSelected }]}>
              <View style={styles.header}>
                <ThemedText type="subtitle">Invite your partner</ThemedText>
                <Pressable onPress={onClose} hitSlop={12}>
                  <Ionicons name="close" size={24} color={theme.textSecondary} />
                </Pressable>
              </View>

              <ThemedText themeColor="textSecondary" type="small">
                {reason ??
                  'Enter the email your partner signed up with. Once linked, notes either of you shares sync between both phones.'}
              </ThemedText>

              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="partner@example.com"
                placeholderTextColor={theme.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />

              {error && (
                <ThemedText type="small" style={{ color: '#E5484D' }}>
                  {error}
                </ThemedText>
              )}

              <Pressable
                onPress={submit}
                disabled={busy || !email.trim()}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.accent, opacity: pressed || busy || !email.trim() ? 0.6 : 1 },
                ]}>
                <ThemedText style={styles.buttonText}>{busy ? 'Linking…' : 'Link partner'}</ThemedText>
              </Pressable>
            </ThemedView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  card: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.five,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: { borderRadius: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, fontSize: 16 },
  button: { borderRadius: Spacing.three, paddingVertical: Spacing.three, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
