import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NoteList } from '@/components/note-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useNotes } from '@/context/notes-context';

export default function NotesScreen() {
  const router = useRouter();
  const { myNotes, createNote } = useNotes();

  async function onCompose() {
    const note = await createNote();
    router.push({ pathname: '/note/[id]', params: { id: note.id } });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Notes</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {myNotes.length} {myNotes.length === 1 ? 'note' : 'notes'}
          </ThemedText>
        </View>

        <NoteList notes={myNotes} emptyLabel={'No notes yet.\nTap the + button to write your first one.'} />

        <Pressable
          onPress={onCompose}
          style={({ pressed }) => [styles.fab, { opacity: pressed ? 0.8 : 1 }]}>
          <Ionicons name="create-outline" size={26} color="#fff" />
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    gap: 2,
  },
  fab: {
    position: 'absolute',
    right: Spacing.four,
    bottom: Spacing.four,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3c87f7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
