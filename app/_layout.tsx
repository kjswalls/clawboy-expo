import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Redirect, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useThemeContext } from '@/contexts/ThemeContext';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { ServerConfigProvider, useServerConfig } from '@/hooks/useServerConfig';
import { AgentsProvider } from '@/hooks/useAgents';
import { ModelsProvider } from '@/hooks/useModels';
import { Colors } from '@/constants/theme';

function NavigationShell(): React.JSX.Element {
  const { isHydrated, serverProfiles } = useServerConfig();
  const pathname = usePathname();
  const { theme } = useThemeContext();

  if (!isHydrated) {
    return (
      <View style={styles.splash} accessibilityLabel="Loading app">
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  const needsOnboarding = serverProfiles.length === 0;
  if (needsOnboarding && pathname !== '/onboarding') {
    return <Redirect href="/onboarding" />;
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
                  <BottomSheetModalProvider>
                    <NavigationShell />
                  </BottomSheetModalProvider>
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
