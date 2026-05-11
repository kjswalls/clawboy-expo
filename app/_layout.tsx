// Install the diagnostic console ring buffer before any other module side
// effects so every log emitted at boot is captured.
import { installConsoleBuffer } from '@/lib/diagnostics/consoleBuffer';
import { recordCrash } from '@/lib/diagnostics/crashRecorder';
installConsoleBuffer();

// Install a global JS error handler to capture unhandled exceptions that
// occur outside React's render tree (async callbacks, native event handlers).
// Wraps the existing handler so Metro/Flipper dev tooling is unaffected.
declare const ErrorUtils: {
  getGlobalHandler: () => (error: Error, isFatal: boolean) => void;
  setGlobalHandler: (handler: (error: Error, isFatal: boolean) => void) => void;
};
if (typeof ErrorUtils !== 'undefined') {
  const prev = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: Error, isFatal: boolean) => {
    void recordCrash({ error });
    // Wrap prev so a throwing previous handler can't double-fault our wrapper.
    try { prev(error, isFatal); } catch { /* swallow — prev's problem, not ours */ }
  });
}

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BrandLoader } from '@/components/common/BrandLoader';
import * as ExpoLinking from 'expo-linking';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useThemeContext } from '@/contexts/ThemeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { AccountProvider } from '@/contexts/AccountContext';
import { PurchasesProvider } from '@/contexts/PurchasesContext';
import { BootReadyProvider } from '@/contexts/BootReadyContext';
import { supabase } from '@/lib/supabase/client';
import { ServerConfigProvider, useServerConfig } from '@/hooks/useServerConfig';
import { ServerProfileSyncProvider } from '@/contexts/ServerProfileSyncContext';
import { AgentsProvider } from '@/hooks/useAgents';
import { ConventionInstallProvider } from '@/contexts/ConventionInstallContext';
import { BadgesProvider } from '@/badges/BadgesProvider';
import { UnlockToast } from '@/components/badges/UnlockToast';
import { useBadges, useSyncEngineUnlocks, useTierUpgradeReveal } from '@/badges/hooks';
import { FileViewerProvider } from '@/contexts/FileViewerContext';
import { LastCrashProvider } from '@/contexts/LastCrashContext';
import { ModelsProvider } from '@/hooks/useModels';
import { SessionsProvider } from '@/hooks/useSessions';
import { useAutoReconnect } from '@/hooks/useAutoReconnect';
import { useOTAUpdate } from '@/hooks/useOTAUpdate';
import { Colors, BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

/** Renders unlock toasts and syncs engine unlocks from the badge system. */
function BadgeLayer(): React.JSX.Element | null {
  const { pendingToasts, clearPendingToasts } = useBadges();
  useSyncEngineUnlocks();
  useTierUpgradeReveal();
  return (
    <UnlockToast queue={pendingToasts} onQueueConsumed={clearPendingToasts} />
  );
}

function NavigationShell(): React.JSX.Element {
  const { isHydrated, serverProfiles } = useServerConfig();
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedScheme, colors } = useThemeContext();
  const { state: otaState, applyUpdate } = useOTAUpdate();
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  // Prevent firing router.replace more than once per redirect cycle.
  const redirectingRef = useRef(false);

  useAutoReconnect();

  // Deep-link handler: extract Supabase magic-link tokens from the inbound
  // clawboy://auth-callback URL fragment and hand them to supabase.auth so
  // onAuthStateChange fires SIGNED_IN. Without this the router would render
  // its built-in "Unmatched Route" page, because detectSessionInUrl is false
  // and so Supabase never sees the tokens on its own.
  useEffect(() => {
    let mounted = true;

    const handleUrl = async (url: string | null): Promise<void> => {
      if (!url) return;
      let parsed: ReturnType<typeof ExpoLinking.parse>;
      try {
        parsed = ExpoLinking.parse(url);
      } catch {
        return;
      }

      // The host vs path parse is inconsistent across platforms, accept either.
      const isAuthCallback =
        parsed.hostname === 'auth-callback' ||
        parsed.path === 'auth-callback' ||
        parsed.path === '/auth-callback';
      if (!isAuthCallback) return;

      const fragment = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
      const fragParams: Record<string, string> = {};
      if (fragment) {
        for (const pair of fragment.split('&')) {
          const [k, v] = pair.split('=');
          if (k) fragParams[k] = v ? decodeURIComponent(v) : '';
        }
      }

      // Magic-link / OTP errors arrive in the fragment too (e.g. expired link).
      if (fragParams['error']) return;

      const accessToken = fragParams['access_token'];
      const refreshToken = fragParams['refresh_token'];
      // PKCE flow (alternative shape) returns ?code=... in the query string.
      const code = parsed.queryParams?.['code'] as string | undefined;

      try {
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        } else if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
      } catch {
        // Surfaced via onAuthStateChange (or absence of it); UI stays
        // responsive thanks to the auth-callback screen's timeout.
      }
    };

    void Linking.getInitialURL().then((u) => {
      if (!mounted) return;
      void handleUrl(u);
    });

    const sub = Linking.addEventListener('url', (event) => {
      if (!mounted) return;
      void handleUrl(event.url);
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

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

  // Show loader while hydrating or while a redirect is in-flight.
  if (!isHydrated || (!serverProfiles.length && pathname !== '/onboarding')) {
    return (
      <View style={styles.splash}>
        <BrandLoader variant="large" palette={Colors.dark} accessibilityLabel="Spinning up Da Boy" />
      </View>
    );
  }

  const showCriticalModal = otaState.phase === 'ready' && otaState.critical;

  return (
    <>
      <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <BadgeLayer />
      <Modal visible={showCriticalModal} transparent animationType="fade">
        <View style={styles.criticalOverlay}>
          <View style={styles.criticalCard}>
            <Text style={styles.criticalTitle}>Security update required</Text>
            <Text style={styles.criticalBody}>
              A critical update has been downloaded and must be applied before you continue.
              ClawBoy will restart now.
            </Text>
            <Pressable
              onPress={() => {
                setApplyingUpdate(true);
                void applyUpdate();
              }}
              disabled={applyingUpdate}
              style={({ pressed }) => [
                styles.criticalBtn,
                (pressed || applyingUpdate) && { opacity: 0.8 },
              ]}
              accessibilityLabel="Restart ClawBoy"
              accessibilityRole="button"
            >
              {applyingUpdate
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.criticalBtnLabel}>Restart now</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function RootLayout(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={styles.root}>
      <LastCrashProvider>
      <ErrorBoundary fallback={ShellErrorFallback}>
        <SafeAreaProvider>
            <AccountProvider>
            <PurchasesProvider>
            <ServerConfigProvider>
              <ServerProfileSyncProvider>
              <ThemeProvider>
                <LanguageProvider>
                <ConnectionProvider>
                  <ConventionInstallProvider>
                  <AgentsProvider>
                    <FileViewerProvider>
                    <ModelsProvider>
                      <SessionsProvider>
                        <BootReadyProvider>
                          <BadgesProvider>
                          <BottomSheetModalProvider>
                            <NavigationShell />
                          </BottomSheetModalProvider>
                          </BadgesProvider>
                        </BootReadyProvider>
                      </SessionsProvider>
                    </ModelsProvider>
                    </FileViewerProvider>
                  </AgentsProvider>
                  </ConventionInstallProvider>
                </ConnectionProvider>
                </LanguageProvider>
              </ThemeProvider>
              </ServerProfileSyncProvider>
            </ServerConfigProvider>
          </PurchasesProvider>
          </AccountProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
      </LastCrashProvider>
    </GestureHandlerRootView>
  );
}

function ShellErrorFallback(): React.JSX.Element {
  return (
    <View style={styles.shellError}>
      <Text style={styles.shellErrorTitle}>ClawBoy encountered an error</Text>
      <Text style={styles.shellErrorBody}>
        Please force-quit and reopen the app. If the problem persists, reinstall.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: { flex: 1, backgroundColor: Colors.dark.background, alignItems: 'center', justifyContent: 'center' },
  criticalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
  },
  criticalCard: {
    backgroundColor: Colors.dark.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing['2xl'],
    gap: Spacing.md,
    maxWidth: 320,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.dark.warning + '50',
  },
  criticalTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.dark.warning,
    textAlign: 'center',
  },
  criticalBody: {
    fontSize: FontSize.sm,
    color: Colors.dark.mutedForeground,
    textAlign: 'center',
    lineHeight: 20,
  },
  criticalBtn: {
    backgroundColor: Colors.dark.warning,
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: Spacing.sm,
    minHeight: 40,
    justifyContent: 'center',
  },
  criticalBtnLabel: {
    color: Colors.dark.warningForeground,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  shellError: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  shellErrorTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.dark.foreground,
    textAlign: 'center',
  },
  shellErrorBody: {
    fontSize: FontSize.sm,
    color: Colors.dark.mutedForeground,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
});
