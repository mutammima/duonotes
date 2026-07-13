import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useNotes } from '@/context/notes-context';
import { useTheme } from '@/hooks/use-theme';

/**
 * A slim status strip shown while the app is offline or has changes still
 * waiting to upload. Hidden entirely when everything is synced and online.
 */
export function SyncBanner() {
  const theme = useTheme();
  const { isOnline, pendingCount } = useNotes();

  if (isOnline && pendingCount === 0) return null;

  const offline = !isOnline;
  const changes = `${pendingCount} ${pendingCount === 1 ? 'change' : 'changes'}`;
  const message = offline
    ? pendingCount > 0
      ? `Offline — ${changes} saved on this device, will sync when you reconnect.`
      : 'Offline — your changes are saved on this device.'
    : `Syncing ${changes}…`;

  return (
    <View style={[styles.banner, { backgroundColor: theme.backgroundElement }]}>
      <Ionicons
        name={offline ? 'cloud-offline-outline' : 'sync-outline'}
        size={15}
        color={theme.textSecondary}
      />
      <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
        {message}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.one,
    borderRadius: Spacing.two,
  },
  text: { flexShrink: 1 },
});
