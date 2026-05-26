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
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { BrandLoader } from '@/components/common/BrandLoader';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ThemeProvider, useThemeContext } from '@/contexts/ThemeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { AccountProvider } from '@/contexts/AccountContext';
import { PurchasesProvider } from '@/contexts/PurchasesContext';
import { BootReadyProvider } from '@/contexts/BootReadyContext';
import { supabase } from '@/lib/supabase/client';
import { parseAuthCallbackUrl } from '@/lib/auth/parseAuthCallbackUrl';
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
import { TtsPreferencesProvider } from '@/contexts/TtsPreferencesContext';
import { HapticsPreferencesProvider } from '@/contexts/HapticsPreferencesContext';
import { ExperimentsProvider } from '@/contexts/ExperimentsContext';

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
  const { t } = useTranslation();
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
      const result = parseAuthCallbackUrl(url);
      try {
        switch (result.kind) {
          case 'ignore':
            return;
          case 'error':
            // Error already surfaced via onAuthStateChange (or absence of it);
            // auth-callback screen's timeout handles the UI.
            return;
          case 'implicit':
            await supabase.auth.setSession({
              access_token: result.accessToken,
              refresh_token: result.refreshToken,
            });
            break;
          case 'pkce':
            await supabase.auth.exchangeCodeForSession(result.code);
            break;
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
    return <SplashWithTimeout />;
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
      <Modal visible={showCriticalModal} transparent animationType="fade" accessibilityViewIsModal={true}>
        <View style={styles.criticalOverlay}>
          <View style={styles.criticalCard}>
            <Text style={styles.criticalTitle}>{t('errors.securityUpdate')}</Text>
            <Text style={styles.criticalBody}>{t('errors.securityUpdateBody')}</Text>
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
              accessibilityLabel={t('errors.restartNow')}
              accessibilityRole="button"
            >
              {applyingUpdate
                ? <ActivityIndicator size="small" color={Colors.dark.warningForeground} />
                : <Text style={styles.criticalBtnLabel}>{t('errors.restartNow')}</Text>}
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
          <KeyboardProvider>
            <AccountProvider>
            <PurchasesProvider>
            <ServerConfigProvider>
              <ServerProfileSyncProvider>
              <ThemeProvider>
                <ExperimentsProvider>
                <LanguageProvider>
                <ConnectionProvider>
                  <ConventionInstallProvider>
                  <AgentsProvider>
                    <FileViewerProvider>
                    <ModelsProvider>
                      <SessionsProvider>
                        <BootReadyProvider>
                          <TtsPreferencesProvider>
                          <HapticsPreferencesProvider>
                          <BadgesProvider>
                          <BottomSheetModalProvider>
                            <NavigationShell />
                          </BottomSheetModalProvider>
                          </BadgesProvider>
                          </HapticsPreferencesProvider>
                          </TtsPreferencesProvider>
                        </BootReadyProvider>
                      </SessionsProvider>
                    </ModelsProvider>
                    </FileViewerProvider>
                  </AgentsProvider>
                  </ConventionInstallProvider>
                </ConnectionProvider>
                </LanguageProvider>
                </ExperimentsProvider>
              </ThemeProvider>
              </ServerProfileSyncProvider>
            </ServerConfigProvider>
          </PurchasesProvider>
          </AccountProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
      </LastCrashProvider>
    </GestureHandlerRootView>
  );
}

function ShellErrorFallback(_error: Error, reset: () => void): React.JSX.Element {
  const onSendReport = (): void => {
    // The crash has already been written by ErrorBoundary.componentDidCatch via
    // recordCrash(); the next launch's LastCrash banner picks it up and offers
    // the FeedbackSheet auto-fill path. If the user can't get past the shell
    // error, the alert below confirms intent.
    console.warn('[ShellErrorFallback] user requested bug report');
    Alert.alert(
      i18n.t('errors.sendBugReport'),
      i18n.t('errors.forceQuitInstruction'),
    );
  };

  return (
    <View style={styles.shellError}>
      <Text style={styles.shellErrorTitle}>{i18n.t('errors.shellError')}</Text>
      <Text style={styles.shellErrorBody}>{i18n.t('errors.shellErrorBodyRevised')}</Text>
      <Pressable
        onPress={reset}
        style={({ pressed }) => [styles.shellPrimaryBtn, pressed && styles.shellBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel={i18n.t('common.tryAgain')}
      >
        <Text style={styles.shellPrimaryBtnText}>{i18n.t('common.tryAgain')}</Text>
      </Pressable>
      <Pressable
        onPress={onSendReport}
        style={({ pressed }) => [styles.shellSecondaryBtn, pressed && styles.shellBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel={i18n.t('errors.sendBugReport')}
      >
        <Text style={styles.shellSecondaryBtnText}>{i18n.t('errors.sendBugReport')}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Splash screen with an 8-second timeout: if hydration stalls, show a tappable
 * hint that triggers Updates.reloadAsync() for a soft restart.
 */
function SplashWithTimeout(): React.JSX.Element {
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShowHint(true), 8000);
    return () => clearTimeout(id);
  }, []);

  const onSoftRestart = (): void => {
    void Updates.reloadAsync().catch(() => {
      // Updates.reloadAsync can throw in dev or if the runtime can't reload.
      // Fall back to advising a force-quit.
      Alert.alert(i18n.t('errors.shellError'), i18n.t('errors.shellErrorBodyRevised'));
    });
  };

  return (
    <View style={styles.splash}>
      <BrandLoader variant="large" palette={Colors.dark} accessibilityLabel="Spinning up Da Boy" />
      {showHint ? (
        <Pressable
          onPress={onSoftRestart}
          style={({ pressed }) => [styles.splashHintBtn, pressed && styles.shellBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={i18n.t('splash.takingLongerHint')}
        >
          <Text style={styles.splashHintText}>{i18n.t('splash.takingLongerHint')}</Text>
        </Pressable>
      ) : null}
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
  shellPrimaryBtn: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
  },
  shellPrimaryBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.dark.primaryForeground,
  },
  shellSecondaryBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.border,
  },
  shellSecondaryBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.dark.foreground,
  },
  shellBtnPressed: { opacity: 0.8 },
  splashHintBtn: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  splashHintText: {
    fontSize: FontSize.sm,
    color: Colors.dark.mutedForeground,
    textAlign: 'center',
    maxWidth: 280,
    textDecorationLine: 'underline',
  },
});
