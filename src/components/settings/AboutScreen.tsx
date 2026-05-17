import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Updates from 'expo-updates';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ChevronRight, RefreshCw } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BrandField } from '@/components/common/BrandField';

import { useTranslation } from 'react-i18next';

import {
  APP_VERSION,
  BUILD_NUMBER,
  LICENSES_URL,
  PRIVACY_POLICY_URL,
  TERMS_URL,
  UPDATE_ID,
} from '@/lib/appMeta';
import { CHANGELOG_ENTRIES } from '@/constants/changelog';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import { BrandLogo } from '@/components/common/BrandLogo';
import {
  getDevBypassTokenStatus,
  type DevBypassTokenStatus,
} from '@/lib/feedback/devBypassToken';
import { emitGumaTapped } from '@/badges/events';

import { styles, Divider } from './about/aboutStyles';
import { ChangelogSection } from './about/ChangelogSection';
import { PrivacySecurityCard } from './about/PrivacySecurityCard';
import { ThreatModelCard } from './about/ThreatModelCard';
import { DebugFeedbackCard } from './about/DebugFeedbackCard';

const DEBUG_REVEALED_KEY = 'clawboy.debug.revealed';
const DEBUG_TAP_COUNT = 7;
const DEBUG_TAP_WINDOW_MS = 3000;

/** About BrandField backdrop band height — keep in sync with `styles.fieldLayer`. */
const ABOUT_FIELD_LAYER_HEIGHT = 300;

// ── Check-for-updates state ────────────────────────────────────────────────

type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; critical: boolean }
  | { kind: 'none' }
  | { kind: 'error'; message: string };

// ── Main component ─────────────────────────────────────────────────────────

export function AboutScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const router = useRouter();
  const logoSize = Math.min(240, Math.round(windowWidth * 0.55));
  const brandFieldInitialSize = useMemo(
    () => ({ width: windowWidth, height: ABOUT_FIELD_LAYER_HEIGHT }),
    [windowWidth],
  );
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ kind: 'idle' });
  const [reloading, setReloading] = useState(false);

  // ── Debug reveal (7-tap on version row) ───────────────────────────────────
  const [debugRevealed, setDebugRevealed] = useState(__DEV__);
  const [bypassStatus, setBypassStatus] = useState<DevBypassTokenStatus>({ set: false, preview: null });
  const tapCountRef = useRef(0);
  const lastTapRef = useRef(0);

  // ── Found the Dragon (7-tap on logo) ─────────────────────────────────────
  const logoTapTimesRef = useRef<number[]>([]);
  const handleLogoTap = useCallback(() => {
    const now = Date.now();
    logoTapTimesRef.current = [
      ...logoTapTimesRef.current.filter((t) => now - t < 3000),
      now,
    ];
    if (logoTapTimesRef.current.length >= 7) {
      logoTapTimesRef.current = [];
      emitGumaTapped();
    }
  }, []);

  useEffect(() => {
    void AsyncStorage.getItem(DEBUG_REVEALED_KEY).then((v) => {
      if (v === '1') setDebugRevealed(true);
    });
    void getDevBypassTokenStatus().then(setBypassStatus);
  }, []);

  const handleVersionTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current > DEBUG_TAP_WINDOW_MS) {
      tapCountRef.current = 0;
    }
    lastTapRef.current = now;
    tapCountRef.current += 1;
    if (tapCountRef.current >= DEBUG_TAP_COUNT) {
      tapCountRef.current = 0;
      void AsyncStorage.setItem(DEBUG_REVEALED_KEY, '1').then(() => {
        setDebugRevealed(true);
      });
    }
  }, []);

  const handleHideDebug = useCallback(() => {
    void AsyncStorage.removeItem(DEBUG_REVEALED_KEY).then(() => {
      if (!__DEV__) setDebugRevealed(false);
    });
  }, []);

  const refreshBypassStatus = useCallback(() => {
    void getDevBypassTokenStatus().then(setBypassStatus);
  }, []);

  const checkForUpdates = useCallback(async (): Promise<void> => {
    if (!Updates.isEnabled) {
      Alert.alert(t('about.updatesDisabledTitle'), t('about.updatesDisabledBody'));
      return;
    }
    setUpdateStatus({ kind: 'checking' });
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        setUpdateStatus({ kind: 'none' });
        return;
      }
      const fetched = await Updates.fetchUpdateAsync();
      const extra = (fetched.manifest as Record<string, unknown> | null | undefined);
      const critical = extra?.['extra'] != null && (extra['extra'] as Record<string, unknown>)['critical'] === true;
      setUpdateStatus({ kind: 'available', critical });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setUpdateStatus({ kind: 'error', message: msg });
    }
  }, []);

  const applyUpdate = useCallback(async (): Promise<void> => {
    setReloading(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setReloading(false);
    }
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* BrandField backdrop — overlay fade avoids nesting a second MaskedView (BrandField has its own). */}
      <Animated.View
        entering={FadeIn.duration(200)}
        style={styles.fieldLayer}
        pointerEvents="none"
      >
        <View style={StyleSheet.absoluteFill}>
          <BrandField initialSize={brandFieldInitialSize} />
          <LinearGradient
            pointerEvents="none"
            colors={['transparent', 'transparent', colors.background]}
            locations={[0, 0.72, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </Animated.View>

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 2 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityLabel={t('about.close')}
          accessibilityRole="button"
        >
          <ArrowLeft size={18} color={colors.mutedForeground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('about.title')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom + Spacing.lg, 32) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo mark — 7 taps reveals Found the Dragon easter egg */}
        <View style={styles.logoWrap}>
          <Pressable
            onPress={handleLogoTap}
            style={[styles.logo, { width: logoSize, height: logoSize }]}
            accessibilityLabel={t('about.logoAccessibility')}
            accessibilityRole="image"
          >
            <BrandLogo
              style={styles.logoImage}
              accessibilityLabel={t('about.logoAccessibility')}
            />
          </Pressable>
        </View>

        {/* App identity */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable onPress={handleVersionTap} accessibilityLabel={t('about.debug.feedbackBypass.tapHint')}>
            <MetaRow label={t('about.version')} value={APP_VERSION} mono colors={{ fg: colors.foreground, muted: colors.mutedForeground }} />
          </Pressable>
          <Divider color={colors.border} />
          <MetaRow label={t('about.build')} value={BUILD_NUMBER} mono colors={{ fg: colors.foreground, muted: colors.mutedForeground }} />
          <Divider color={colors.border} />
          <MetaRow
            label={t('about.updateId')}
            value={UPDATE_ID ?? t('about.embeddedBuild')}
            mono
            colors={{ fg: colors.foreground, muted: colors.mutedForeground }}
          />
        </View>

        {/* Check for updates */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: Spacing.md }]}>
          <Pressable
            onPress={() => { void checkForUpdates(); }}
            disabled={updateStatus.kind === 'checking'}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
            accessibilityLabel={t('about.checkForUpdates')}
            accessibilityRole="button"
          >
            <RefreshCw size={16} color={colors.primary} />
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>
              {t('about.checkForUpdates')}
            </Text>
            {updateStatus.kind === 'checking' && (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            )}
          </Pressable>

          <UpdateBadge status={updateStatus} colors={colors} onApply={() => { void applyUpdate(); }} reloading={reloading} />
        </View>

        {/* Debug — feedback rate-limit bypass (hidden; revealed by 7-tap on version) */}
        {debugRevealed && (
          <DebugFeedbackCard
            colors={colors}
            bypassStatus={bypassStatus}
            onStatusChange={refreshBypassStatus}
            onHide={handleHideDebug}
          />
        )}

        {/* Privacy and Security */}
        <PrivacySecurityCard colors={colors} />

        {/* Security & Threat Model */}
        <ThreatModelCard colors={colors} />

        {/* Legal */}
        <LegalLinksCard colors={colors} />

        {/* Changelog */}
        <ChangelogSection colors={colors} />
      </ScrollView>
    </View>
  );
}

// ── Sub-components (AboutScreen-only) ─────────────────────────────────────

function MetaRow({
  label,
  value,
  mono = false,
  colors,
}: {
  label: string;
  value: string;
  mono?: boolean;
  colors: { fg: string; muted: string };
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={[styles.metaLabel, { color: colors.muted }]}>{label}</Text>
      <Text
        style={[styles.metaValue, { color: colors.fg }, mono && styles.metaMono]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

type UpdateBadgeProps = {
  status: UpdateStatus;
  colors: ReturnType<typeof useTheme>['colors'];
  onApply: () => void;
  reloading: boolean;
};

function UpdateBadge({ status, colors, onApply, reloading }: UpdateBadgeProps): React.JSX.Element | null {
  const { t } = useTranslation();
  if (status.kind === 'idle' || status.kind === 'checking') return null;

  if (status.kind === 'none') {
    return (
      <View style={[styles.badge, { backgroundColor: `${colors.success}18` }]}>
        <Text style={{ color: colors.success, fontSize: FontSize.xs }}>{t('about.upToDate')}</Text>
      </View>
    );
  }

  if (status.kind === 'error') {
    return (
      <View style={[styles.badge, { backgroundColor: `${colors.destructive}18` }]}>
        <Text style={{ color: colors.destructive, fontSize: FontSize.xs }}>{status.message}</Text>
      </View>
    );
  }

  // available
  const badgeColor = status.critical ? colors.warning : colors.primary;
  const label = status.critical
    ? t('about.securityUpdateReady')
    : t('about.updateReady');

  return (
    <View style={[styles.badge, { backgroundColor: `${badgeColor}18` }]}>
      <Text style={{ color: badgeColor, fontSize: FontSize.xs, flex: 1 }}>{label}</Text>
      {status.critical && (
        <Pressable
          onPress={onApply}
          disabled={reloading}
          style={({ pressed }) => [
            styles.restartBtn,
            { backgroundColor: badgeColor, opacity: pressed || reloading ? 0.75 : 1 },
          ]}
          accessibilityLabel={t('about.restart')}
          accessibilityRole="button"
        >
          {reloading
            ? <ActivityIndicator size="small" color={colors.warningForeground} />
            : <Text style={{ color: colors.warningForeground, fontSize: FontSize.xs, fontWeight: FontWeight.semibold }}>{t('about.restart')}</Text>}
        </Pressable>
      )}
    </View>
  );
}

function LegalLinksCard({ colors }: { colors: ThemeColors }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: Spacing.md }]}>
      <Pressable
        onPress={() => { void WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL); }}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
        accessibilityRole="link"
        accessibilityLabel={t('about.privacyPolicy')}
      >
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{t('about.privacyPolicy')}</Text>
        <ChevronRight size={14} color={colors.mutedForeground} />
      </Pressable>
      <View style={[StyleSheet.absoluteFill, { display: 'none' }]} />
      <Divider color={colors.border} />
      <Pressable
        onPress={() => { void WebBrowser.openBrowserAsync(TERMS_URL); }}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
        accessibilityRole="link"
        accessibilityLabel={t('about.termsOfService')}
      >
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{t('about.termsOfService')}</Text>
        <ChevronRight size={14} color={colors.mutedForeground} />
      </Pressable>
      <Divider color={colors.border} />
      <Pressable
        onPress={() => { void WebBrowser.openBrowserAsync(LICENSES_URL); }}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
        accessibilityRole="link"
        accessibilityLabel={t('about.openSourceLicenses')}
      >
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{t('about.openSourceLicenses')}</Text>
        <ChevronRight size={14} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}
