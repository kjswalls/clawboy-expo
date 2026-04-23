import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useThemeContext } from '@/contexts/ThemeContext';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { ServerConfigProvider, useServerConfig } from '@/hooks/useServerConfig';
import { AgentsProvider } from '@/hooks/useAgents';
import { ModelsProvider } from '@/hooks/useModels';
import { SessionsProvider } from '@/hooks/useSessions';
import { useAutoReconnect } from '@/hooks/useAutoReconnect';
import { Colors } from '@/constants/theme';

function NavigationShell(): React.JSX.Element {
  const { isHydrated, serverProfiles } = useServerConfig();
  const pathname = usePathname();
  const router = useRouter();
  const { theme } = useThemeContext();
  // Prevent firing router.replace more than once per redirect cycle.
  const redirectingRef = useRef(false);

  useAutoReconnect();

  useEffect(() => {
    if (!isHydrated) return;
    if (serverProfiles.length > 0) {
      redirectingRef.current = false;
      return;
    }
    // No profiles — send to onboarding. Guard against repeat calls while
    // the navigation is in-flight (pathname hasn't updated yet).
    if (pathname !== '/onboarding' && !redirectingRef.current) {
      redirectingRef.current = true;
      router.replace('/onboarding');
    }
  }, [isHydrated, serverProfiles.length, pathname, router]);

  // Show spinner while hydrating or while a redirect is in-flight.
  if (!isHydrated || (!serverProfiles.length && pathname !== '/onboarding')) {
    return (
      <View style={styles.splash} accessibilityLabel="Loading app">
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme === 'dark' ? Colors.dark.background : Colors.light.background },
        }}
      />
    </>
  );
}

export default function RootLayout(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ServerConfigProvider>
          <ThemeProvider>
            <ConnectionProvider>
              <AgentsProvider>
                <ModelsProvider>
                  <SessionsProvider>
                    <BottomSheetModalProvider>
                      <NavigationShell />
                    </BottomSheetModalProvider>
                  </SessionsProvider>
                </ModelsProvider>
              </AgentsProvider>
            </ConnectionProvider>
          </ThemeProvider>
        </ServerConfigProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: { flex: 1, backgroundColor: Colors.dark.background, alignItems: 'center', justifyContent: 'center' },
});
