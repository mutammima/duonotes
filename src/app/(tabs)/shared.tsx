import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NoteList } from '@/components/note-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useNotes } from '@/context/notes-context';

export default function SharedScreen() {
  const { sharedNotes } = useNotes();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Shared</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Notes you and your partner can both see
          </ThemedText>
        </View>

        <NoteList
          notes={sharedNotes}
          emptyLabel={'Nothing shared yet.\nOpen a note and tap Share to add it here.'}
        />
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
});
