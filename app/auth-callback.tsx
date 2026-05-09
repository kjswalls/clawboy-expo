/**
 * Auth-callback landing screen.
 *
 * Expo Router renders this when a Supabase magic-link / OAuth deep link
 * (clawboy://auth-callback#access_token=...&refresh_token=...) opens the app.
 * The actual token-extraction + supabase.auth.setSession call happens in the
 * global Linking listener mounted in app/_layout.tsx — this screen just shows
 * a spinner and bounces back to '/' once a session is established (or a short
 * timeout, so users don't get stuck if the link is malformed).
 *
 * Without this file the router would render its built-in "Unmatched Route"
 * 404 page for the few hundred ms between the deep link arriving and the
 * sign-in / redirect cycle completing.
 */

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccountContext } from '@/contexts/AccountContext';
import { BrandLoader } from '@/components/common/BrandLoader';
import { Colors } from '@/constants/theme';

export default function AuthCallback(): React.JSX.Element {
  const router = useRouter();
  const { status } = useAccountContext();
  const { t } = useTranslation();

  useEffect(() => {
    // Once Supabase reports a definitive state (signed-in or signed-out),
    // leave this transient screen. The root layout's redirect logic will
    // bounce on to /onboarding when the user has no server profiles, or
    // keep them on / otherwise.
    if (status === 'signed-in' || status === 'signed-out') {
      router.replace('/');
    }
  }, [status, router]);

  // Safety net: if no auth state arrives within 5s (e.g. expired magic link
  // or malformed URL), still bail to '/' so the user isn't stranded.
  useEffect(() => {
    const t = setTimeout(() => { router.replace('/'); }, 5000);
    return () => { clearTimeout(t); };
  }, [router]);

  return (
    <View style={styles.root}>
      <BrandLoader variant="large" palette={Colors.dark} accessibilityLabel={t('auth.signingIn')} label={t('auth.signingIn')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
