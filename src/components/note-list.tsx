import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { htmlToPlain } from '@/lib/markdown';
import type { Note } from '@/lib/types';

/** Locked notes keep their body hidden from search, same as the row preview does. */
type Searchable = { note: Note; titleLower: string; bodyLower: string };

function buildSearchIndex(notes: Note[]): Searchable[] {
  return notes.map((note) => ({
    note,
    titleLower: note.title.toLowerCase(),
    bodyLower: note.lockType === 'none' ? htmlToPlain(note.body).toLowerCase() : '',
  }));
}

export function NoteList({
  notes,
  emptyLabel,
  emptyIcon = 'document-text-outline',
}: {
  notes: Note[];
  emptyLabel: string;
  emptyIcon?: keyof typeof Ionicons.glyphMap;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  // Plain-text extraction only needs to re-run when the notes themselves
  // change, not on every keystroke — filtering against the cached lowercase
  // text below is a cheap string scan either way.
  const searchIndex = useMemo(() => buildSearchIndex(notes), [notes]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return searchIndex.filter((s) => s.titleLower.includes(q) || s.bodyLower.includes(q)).map((s) => s.note);
  }, [searchIndex, query, notes]);

  if (notes.length === 0) {
    return <EmptyState icon={emptyIcon} theme={theme} text={emptyLabel} />;
  }

  return (
    <>
      <View style={styles.searchRow}>
        <View style={[styles.searchBar, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
          <Ionicons name="search" size={16} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search notes"
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="never"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      {filtered.length === 0 ? (
        <EmptyState icon="search" size={30} theme={theme} text={`No notes match "${query.trim()}"`} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={styles.rowGap} />}
          renderItem={({ item }) => <NoteRow note={item} />}
        />
      )}
    </>
  );
}

function EmptyState({
  icon,
  size = 34,
  theme,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  size?: number;
  theme: ReturnType<typeof useTheme>;
  text: string;
}) {
  return (
    <ThemedView style={styles.empty}>
      <View style={[styles.emptyBadge, { backgroundColor: theme.accentSoft }]}>
        <Ionicons name={icon} size={size} color={theme.accent} />
      </View>
      <ThemedText themeColor="textSecondary" style={styles.emptyText}>
        {text}
      </ThemedText>
    </ThemedView>
  );
}

function NoteRow({ note }: { note: Note }) {
  const theme = useTheme();
  const router = useRouter();
  const locked = note.lockType !== 'none';

  const preview = locked
    ? 'Locked — tap to unlock'
    : htmlToPlain(note.body) || 'No additional text';

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/note/[id]', params: { id: note.id } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected },
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
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
            color={theme.accent}
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
  searchRow: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.three },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    height: 40,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0, height: '100%' },
  listContent: { paddingHorizontal: Spacing.four, paddingTop: Spacing.one, paddingBottom: Spacing.six },
  rowGap: { height: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16 },
  rowSubtitle: { flexDirection: 'row', gap: Spacing.two },
  preview: { flexShrink: 1 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  emptyBadge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  emptyText: { textAlign: 'center', lineHeight: 22 },
});
