import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Shown when the Supabase environment variables aren't set yet, so the app
 * explains what to do instead of crashing on the first network call.
 */
export function ConfigNotice() {
  const theme = useTheme();
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Ionicons name="cloud-offline-outline" size={48} color={theme.textSecondary} />
        <ThemedText type="subtitle" style={styles.center}>
          Almost there
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          DuoNotes needs your Supabase project to sync notes between both phones.
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">1. Create a free project at supabase.com</ThemedText>
          <ThemedText type="smallBold">2. Run supabase/schema.sql in the SQL Editor</ThemedText>
          <ThemedText type="smallBold">3. Copy .env.example to .env and fill in:</ThemedText>
          <View style={styles.codeBlock}>
            <ThemedText type="code">EXPO_PUBLIC_SUPABASE_URL=…</ThemedText>
            <ThemedText type="code">EXPO_PUBLIC_SUPABASE_ANON_KEY=…</ThemedText>
          </View>
          <ThemedText type="smallBold">4. Restart the dev server (npm start)</ThemedText>
        </ThemedView>

        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          Full steps are in the project README.
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  center: { textAlign: 'center' },
  card: { borderRadius: Spacing.three, padding: Spacing.four, gap: Spacing.two, alignSelf: 'stretch' },
  codeBlock: { paddingVertical: Spacing.one, gap: 2 },
});
