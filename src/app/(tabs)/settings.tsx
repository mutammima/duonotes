import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { clearPin, getBiometricStatus, isPinSet, setPin, type BiometricStatus } from '@/lib/security';

export default function SettingsScreen() {
  const theme = useTheme();
  const { user, signOut, linkPartner } = useAuth();

  const [pinSet, setPinSet] = useState(false);
  const [biometric, setBiometric] = useState<BiometricStatus | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [partnerEmail, setPartnerEmail] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    isPinSet().then(setPinSet);
    getBiometricStatus().then(setBiometric);
  }, []);

  async function handleLinkPartner() {
    setLinkError(null);
    setLinking(true);
    try {
      await linkPartner(partnerEmail);
      setShowLinkModal(false);
      setPartnerEmail('');
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : 'Could not link that account.');
    } finally {
      setLinking(false);
    }
  }

  async function handleSetPin(pin: string) {
    await setPin(pin);
    setPinSet(true);
    setShowPinModal(false);
    return true;
  }

  function confirmRemovePin() {
    Alert.alert('Remove PIN?', 'PIN-locked notes will no longer be protected on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await clearPin();
          setPinSet(false);
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle" style={styles.title}>
            Settings
          </ThemedText>

          <Section title="Account">
            <Row icon="person-circle-outline" label={user?.name ?? '—'} value={user?.email} />
          </Section>

          <Section title="Partner">
            {user?.partnerId ? (
              <Row icon="heart" label="Linked with your partner" value="Shared notes will sync" />
            ) : (
              <Pressable onPress={() => setShowLinkModal(true)}>
                <Row
                  icon="person-add-outline"
                  label="Link your partner"
                  value="Connect by their email to share notes"
                  chevron
                />
              </Pressable>
            )}
          </Section>

          <Section title="Security">
            <Pressable onPress={() => setShowPinModal(true)}>
              <Row
                icon="keypad-outline"
                label={pinSet ? 'Change PIN' : 'Set a PIN'}
                value={pinSet ? 'PIN is set' : 'Not set'}
                chevron
              />
            </Pressable>
            {pinSet && (
              <Pressable onPress={confirmRemovePin}>
                <Row icon="trash-outline" label="Remove PIN" danger chevron />
              </Pressable>
            )}
            <Row
              icon="finger-print-outline"
              label={biometric?.label ?? 'Biometrics'}
              value={
                !biometric
                  ? 'Checking…'
                  : !biometric.available
                    ? 'Not available on this device'
                    : biometric.enrolled
                      ? 'Ready to use'
                      : 'Not set up in system settings'
              }
            />
          </Section>

          <Section title="About">
            <ThemedText type="small" themeColor="textSecondary" style={styles.about}>
              Notes sync securely between you and your linked partner via Supabase. Your PIN and
              biometrics stay on this device. At-rest encryption of locked notes is still on the
              roadmap (see the project README).
            </ThemedText>
          </Section>

          <Pressable
            onPress={() => signOut()}
            style={({ pressed }) => [
              styles.signOut,
              { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
            ]}>
            <ThemedText style={{ color: '#E5484D', fontWeight: '600' }}>Sign out</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <PinModal
        visible={showPinModal}
        mode="set"
        title="Set your PIN"
        onSubmit={handleSetPin}
        onCancel={() => setShowPinModal(false)}
      />

      <Modal
        visible={showLinkModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowLinkModal(false)}>
        <ThemedView style={styles.linkModal}>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <SafeAreaView style={styles.linkModalBody}>
              <View style={styles.linkHeader}>
                <Pressable onPress={() => setShowLinkModal(false)} hitSlop={12}>
                  <ThemedText type="link" style={{ color: '#3c87f7' }}>
                    Cancel
                  </ThemedText>
                </Pressable>
              </View>

              <Ionicons name="heart" size={40} color="#3c87f7" />
              <ThemedText type="subtitle" style={styles.center}>
                Link your partner
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.center}>
                Enter the email your partner signed up with. Once linked, notes either of you shares
                will appear for both.
              </ThemedText>

              <TextInput
                value={partnerEmail}
                onChangeText={setPartnerEmail}
                placeholder="partner@example.com"
                placeholderTextColor={theme.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.linkInput,
                  { color: theme.text, backgroundColor: theme.backgroundElement },
                ]}
              />

              {linkError && (
                <ThemedText type="small" style={{ color: '#E5484D' }}>
                  {linkError}
                </ThemedText>
              )}

              <Pressable
                onPress={handleLinkPartner}
                disabled={linking || !partnerEmail.trim()}
                style={({ pressed }) => [
                  styles.linkButton,
                  { opacity: pressed || linking || !partnerEmail.trim() ? 0.6 : 1 },
                ]}>
                <ThemedText style={styles.linkButtonText}>
                  {linking ? 'Linking…' : 'Link partner'}
                </ThemedText>
              </Pressable>
            </SafeAreaView>
          </KeyboardAvoidingView>
        </ThemedView>
      </Modal>
    </ThemedView>
  );

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <View style={styles.section}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
          {title.toUpperCase()}
        </ThemedText>
        <ThemedView type="backgroundElement" style={styles.card}>
          {children}
        </ThemedView>
      </View>
    );
  }

  function Row({
    icon,
    label,
    value,
    chevron,
    danger,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value?: string;
    chevron?: boolean;
    danger?: boolean;
  }) {
    return (
      <View style={styles.row}>
        <Ionicons name={icon} size={22} color={danger ? '#E5484D' : theme.text} />
        <View style={styles.rowText}>
          <ThemedText style={danger ? { color: '#E5484D' } : undefined}>{label}</ThemedText>
          {value && (
            <ThemedText type="small" themeColor="textSecondary">
              {value}
            </ThemedText>
          )}
        </View>
        {chevron && <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  title: { marginBottom: Spacing.one },
  section: { gap: Spacing.two },
  sectionTitle: { marginLeft: Spacing.two, letterSpacing: 0.5 },
  card: { borderRadius: Spacing.three, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowText: { flex: 1, gap: 2 },
  about: { paddingHorizontal: Spacing.one },
  signOut: {
    marginTop: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  flex: { flex: 1 },
  linkModal: { flex: 1 },
  linkModalBody: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  linkHeader: { position: 'absolute', top: Spacing.four, left: Spacing.four },
  center: { textAlign: 'center' },
  linkInput: {
    alignSelf: 'stretch',
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
  linkButton: {
    alignSelf: 'stretch',
    backgroundColor: '#3c87f7',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  linkButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
