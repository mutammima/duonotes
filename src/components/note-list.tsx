import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Note } from '@/lib/types';

export function NoteList({ notes, emptyLabel }: { notes: Note[]; emptyLabel: string }) {
  const theme = useTheme();

  if (notes.length === 0) {
    return (
      <ThemedView style={styles.empty}>
        <Ionicons name="document-text-outline" size={40} color={theme.textSecondary} />
        <ThemedText themeColor="textSecondary" style={styles.emptyText}>
          {emptyLabel}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <FlatList
      data={notes}
      keyExtractor={(n) => n.id}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={() => (
        <View style={[styles.separator, { backgroundColor: theme.backgroundSelected }]} />
      )}
      renderItem={({ item }) => <NoteRow note={item} />}
    />
  );
}

function NoteRow({ note }: { note: Note }) {
  const theme = useTheme();
  const router = useRouter();
  const locked = note.lockType !== 'none';

  const preview = locked
    ? 'Locked — tap to unlock'
    : note.body.replace(/\n+/g, ' ').trim() || 'No additional text';

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/note/[id]', params: { id: note.id } })}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.rowMain}>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.rowTitle}>
          {note.title.trim() || 'New Note'}
        </ThemedText>
        <View style={styles.rowSubtitle}>
          <ThemedText type="small" themeColor="textSecondary">
            {formatWhen(note.updatedAt)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.preview}>
            {preview}
          </ThemedText>
        </View>
      </View>
      <View style={styles.badges}>
        {note.isShared && <Ionicons name="people" size={16} color={theme.textSecondary} />}
        {locked && (
          <Ionicons
            name={note.lockType === 'biometric' ? 'finger-print' : 'lock-closed'}
            size={16}
            color="#3c87f7"
          />
        )}
      </View>
    </Pressable>
  );
}

function formatWhen(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    gap: Spacing.two,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16 },
  rowSubtitle: { flexDirection: 'row', gap: Spacing.two },
  preview: { flexShrink: 1 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  emptyText: { textAlign: 'center' },
});
