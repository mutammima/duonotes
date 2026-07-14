import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NoteList } from '@/components/note-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useNotes } from '@/context/notes-context';
import { useTheme } from '@/hooks/use-theme';

export default function SharedScreen() {
  const theme = useTheme();
  const { sharedNotes } = useNotes();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={[styles.hero, { backgroundColor: theme.accentSoft }]}>
          <ThemedText type="subtitle">Shared 💞</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Notes you and your partner can both see
          </ThemedText>
        </View>

        <NoteList
          notes={sharedNotes}
          emptyIcon="heart-outline"
          emptyLabel={'Nothing shared yet 💕\nOpen a note and tap the people icon to share it.'}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  hero: {
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
    marginBottom: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
    gap: 2,
  },
});
