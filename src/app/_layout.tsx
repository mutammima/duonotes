import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { NotesProvider } from '@/context/notes-context';

SplashScreen.preventAutoHideAsync();

/**
 * Chooses which routes are reachable based on auth state. Expo Router's
 * `Stack.Protected` guard automatically redirects away from screens the user
 * isn't allowed to see, so we never render the tabs to a signed-out user.
 */
function RootNavigator() {
  const { user, initializing } = useAuth();

  // Keep the splash overlay up until we know whether a session was restored.
  if (initializing) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="note/[id]"
          options={{ presentation: 'modal', headerShown: false }}
        />
      </Stack.Protected>

      <Stack.Protected guard={!user}>
        <Stack.Screen name="auth" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <NotesProvider>
            <AnimatedSplashOverlay />
            <RootNavigator />
          </NotesProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
