import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Updates from 'expo-updates';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { ArrowLeft, ChevronDown, ChevronRight, RefreshCw, Shield, ShieldCheck } from 'lucide-react-native';
import Markdown from '@ronradtke/react-native-markdown-display';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BrandField } from '@/components/common/BrandField';

import { useTranslation } from 'react-i18next';

import { APP_VERSION, BUILD_NUMBER, UPDATE_ID, PRIVACY_POLICY_URL, TERMS_URL, LICENSES_URL } from '@/lib/appMeta';
import { hexToRgba } from '@/utils/color';
import { CHANGELOG_ENTRIES } from '@/constants/changelog';
import type { ChangelogEntry, ChangelogSection as ChangelogBodySection } from '@/constants/changelog';
import { useTheme } from '@/hooks/useTheme';
import { changelogMarkdownIt, createChangelogItemMarkdownStyles } from '@/utils/markdownTheme';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import i18n from '@/i18n';
import { BrandLogo } from '@/components/common/BrandLogo';
import {
  getDevBypassTokenStatus,
  setDevBypassToken,
  clearDevBypassToken,
  DEV_BYPASS_TOKEN_MIN_LENGTH,
  type DevBypassTokenStatus,
} from '@/lib/feedback/devBypassToken';
import { translateClawError } from '@/utils/translateError';
import { emitGumaTapped } from '@/badges/events';

const DEBUG_REVEALED_KEY = 'clawboy.debug.revealed';
const DEBUG_TAP_COUNT = 7;
const DEBUG_TAP_WINDOW_MS = 3000;

type LabelItemsSection = {
  label: string;
  items: string[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

function parseLabelItemSections(raw: unknown): LabelItemsSection[] {
  if (!Array.isArray(raw)) return [];
  const out: LabelItemsSection[] = [];
  for (const el of raw) {
    if (!el || typeof el !== 'object') continue;
    const o = el as Record<string, unknown>;
    if (typeof o.label !== 'string' || !Array.isArray(o.items)) continue;
    const items = o.items.filter((x): x is string => typeof x === 'string');
    out.push({ label: o.label, items });
  }
  return out;
}

function parseChangelogEntries(raw: unknown): ChangelogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ChangelogEntry[] = [];
  for (const el of raw) {
    if (!el || typeof el !== 'object') continue;
    const o = el as Record<string, unknown>;
    if (typeof o.version !== 'string') continue;
    const date: string | null =
      o.date === null || typeof o.date === 'string' ? (o.date as string | null) : null;
    const sectionsRaw = o.sections;
    if (!Array.isArray(sectionsRaw)) continue;
    const sections: ChangelogBodySection[] = [];
    for (const s of sectionsRaw) {
      if (!s || typeof s !== 'object') continue;
      const so = s as Record<string, unknown>;
      const title = typeof so.title === 'string' ? so.title : '';
      const itemsRaw = so.items;
      if (!Array.isArray(itemsRaw)) continue;
      const items = itemsRaw.filter((x): x is string => typeof x === 'string');
      sections.push({ title, items });
    }
    const entry: ChangelogEntry = { version: o.version, date, sections };
    if (typeof o.emptyNote === 'string') {
      entry.emptyNote = o.emptyNote;
    }
    out.push(entry);
  }
  return out;
}

function formatReleaseDate(iso: string): string {
  try {
    // Append T00:00:00 so the date is interpreted as local midnight, not UTC
    const d = new Date(`${iso}T00:00:00`);
    return new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
  } catch {
    return iso;
  }
}

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
      {/* BrandField animated backdrop — covers header + logo region, fades to transparent */}
      <Animated.View
        entering={FadeIn.duration(700)}
        style={styles.fieldLayer}
        pointerEvents="none"
      >
        <MaskedView
          style={StyleSheet.absoluteFill}
          maskElement={
            <LinearGradient
              colors={['white', 'white', 'transparent']}
              locations={[0, 0.72, 1]}
              style={StyleSheet.absoluteFill}
            />
          }
        >
          <BrandField />
        </MaskedView>
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

// ── CollapsibleSection ─────────────────────────────────────────────────────

function CollapsibleSection({
  header,
  colors,
  fadeColor,
  previewMaxHeight = 130,
  children,
}: {
  header: React.ReactNode;
  colors: ThemeColors;
  fadeColor: string;
  previewMaxHeight?: number;
  children: React.ReactNode;
}): React.JSX.Element {
  const { t: tCollapsible } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const rotation = useSharedValue(0);

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !expanded;
    setExpanded(next);
    rotation.value = withTiming(next ? 1 : 0, { duration: 200 });
  }, [expanded, rotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 180}deg` }],
  }));

  return (
    <>
      {/* Header row */}
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.collapsibleHeader, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View style={styles.collapsibleHeaderContent}>{header}</View>
        <Animated.View style={chevronStyle}>
          <ChevronDown size={16} color={colors.mutedForeground} />
        </Animated.View>
      </Pressable>

      {/* Body — clamped when collapsed */}
      <View style={[styles.collapsibleBody, !expanded && { maxHeight: previewMaxHeight, overflow: 'hidden' }]}>
        {children}
        {!expanded && (
          <LinearGradient
            colors={[hexToRgba(fadeColor, 0), fadeColor]}
            style={styles.fadeGradient}
            pointerEvents="none"
          />
        )}
      </View>

      {/* Expand / collapse chevron row */}
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.chevronToggleRow, { borderTopColor: colors.border }, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={expanded ? tCollapsible('about.collapseSection') : tCollapsible('about.expandSection')}
      >
        <Animated.View style={chevronStyle}>
          <ChevronDown size={16} color={colors.mutedForeground} />
        </Animated.View>
      </Pressable>
    </>
  );
}

// ── ChangelogSection ───────────────────────────────────────────────────────

function ChangelogSection({ colors }: { colors: ThemeColors }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const entries = useMemo((): ChangelogEntry[] => {
    if (i18n.language.startsWith('zh')) {
      const parsed = parseChangelogEntries(t('about.changelogEntries', { returnObjects: true }));
      if (parsed.length > 0) return parsed;
    }
    return CHANGELOG_ENTRIES;
  }, [i18n.language, t]);

  return (
    <View style={styles.changelogOuter}>
      <CollapsibleSection
        header={
          <Text style={[styles.collapsibleSectionTitle, { color: colors.foreground }]}>
            {t('about.changelog')}
          </Text>
        }
        colors={colors}
        fadeColor={colors.background}
        previewMaxHeight={130}
      >
        {entries.map((entry, i) => (
          <ChangelogEntryCard
            key={entry.version}
            entry={entry}
            colors={colors}
            style={i > 0 ? { marginTop: Spacing.sm } : undefined}
          />
        ))}
        <ChangelogFootnote colors={colors} />
      </CollapsibleSection>
    </View>
  );
}

// ── ChangelogEntryCard ─────────────────────────────────────────────────────

function ChangelogMarkdownBullet({
  item,
  colors,
}: {
  item: string;
  colors: ThemeColors;
}): React.JSX.Element {
  const mdStyles = useMemo(() => createChangelogItemMarkdownStyles(colors), [colors]);
  return (
    <View style={styles.bulletRow}>
      <Text style={[styles.bullet, { color: colors.mutedForeground }]}>{'•'}</Text>
      <View style={styles.bulletMarkdownWrap}>
        <Markdown
          style={mdStyles}
          markdownit={changelogMarkdownIt}
          onLinkPress={(url) => {
            void Linking.openURL(url);
            return true;
          }}
        >
          {item}
        </Markdown>
      </View>
    </View>
  );
}

function ChangelogEntryCard({
  entry,
  colors,
  style,
}: {
  entry: ChangelogEntry;
  colors: ThemeColors;
  style?: object;
}): React.JSX.Element {
  const { t } = useTranslation();
  const isUnreleased = entry.version === 'Unreleased';

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      {/* Version header row */}
      <View style={styles.entryHeader}>
        <Text style={[styles.entryVersion, { color: colors.foreground }]}>
          {isUnreleased ? t('about.unreleased') : entry.version}
        </Text>
        {entry.date != null && (
          <Text style={[styles.entryDate, { color: colors.mutedForeground }]}>
            {formatReleaseDate(entry.date)}
          </Text>
        )}
      </View>

      {/* Empty note (e.g. Unreleased with no items) */}
      {entry.sections.length === 0 && entry.emptyNote != null && (
        <>
          <Divider color={colors.border} />
          <Text style={[styles.emptyNote, { color: colors.mutedForeground }]}>
            {entry.emptyNote}
          </Text>
        </>
      )}

      {/* Sections */}
      {entry.sections.map((section, si) => (
        <View key={si}>
          <Divider color={colors.border} />
          {section.title !== '' && (
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {section.title.toUpperCase()}
            </Text>
          )}
          <View style={styles.itemList}>
            {section.items.map((item, ii) => (
              <ChangelogMarkdownBullet key={ii} item={item} colors={colors} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// ── ChangelogFootnote ──────────────────────────────────────────────────────

function ChangelogFootnote({ colors }: { colors: ThemeColors }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View style={styles.footnote}>
      <View style={styles.footnoteRow}>
        <Text style={[styles.footnoteText, { color: colors.mutedForeground }]}>{t('about.changelogFormat')} </Text>
        <Text
          style={[styles.footnoteLink, { color: colors.mutedForeground, borderBottomColor: colors.mutedForeground }]}
          onPress={() => { void WebBrowser.openBrowserAsync('https://keepachangelog.com/en/1.1.0/'); }}
          accessibilityRole="link"
        >
          {t('about.keepChangelog')}
        </Text>
        <Text style={[styles.footnoteText, { color: colors.mutedForeground }]}>{' · '}</Text>
        <Text
          style={[styles.footnoteLink, { color: colors.mutedForeground, borderBottomColor: colors.mutedForeground }]}
          onPress={() => { void WebBrowser.openBrowserAsync('https://semver.org/spec/v2.0.0.html'); }}
          accessibilityRole="link"
        >
          {t('about.semver')}
        </Text>
      </View>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

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

function Divider({ color }: { color: string }): React.JSX.Element {
  return <View style={[styles.divider, { backgroundColor: color }]} />;
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
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={{ color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.semibold }}>{t('about.restart')}</Text>}
        </Pressable>
      )}
    </View>
  );
}

// ── PrivacySecurityCard ────────────────────────────────────────────────────

type PrivacySection = LabelItemsSection;

const DEFAULT_PRIVACY_SECTIONS: PrivacySection[] = [
  {
    label: 'CONNECTIONS — LOCAL-FIRST',
    items: [
      'Your conversations travel directly between this device and the OpenClaw gateway you\'ve configured. ClawBoy does not proxy, route, or read your traffic.',
      'Connections default to encrypted TLS (wss://). If you enter a ws:// or http:// URL, the app warns you before saving it.',
      'TOFU SPKI certificate pinning is available. After your first successful connection, ClawBoy records the gateway\'s certificate public key. You can promote it to an active pin in Settings → Connection → Pinned Keys. Once pinned, the app blocks any connection whose certificate does not match — before any credentials are sent.',
      'For maximum protection against TLS-inspecting proxies and rogue certificate authorities, we recommend pinning your gateway certificate and running it behind a VPN like Tailscale, WireGuard, or Cloudflare Tunnel.',
    ],
  },
  {
    label: 'WHAT\'S STORED ON DEVICE',
    items: [
      'Gateway tokens, your device identity, and the chat-cache encryption key live in the iOS Keychain / Android Keystore via Expo SecureStore.',
      'The last 20 messages per server, kept so chat appears instantly on cold start, are encrypted with AES-256-GCM before they touch disk.',
      'If a JavaScript error or UI crash occurs, a minimal crash record (error type, message, component stack, and app version) is stored locally, encrypted with the same AES-256-GCM key. On next launch, the feedback form pre-fills a bug report using only the error type and message — the component stack stays on device.',
      'Server profile names and URLs, theme, and UI preferences are stored in plain app storage. They do not contain credentials.',
    ],
  },
  // {
  //   label: 'ON-DEVICE STATISTICS',
  //   items: [
  //     'Anonymous counters (e.g. number of messages sent, model switches) can power optional achievement badges.',
  //     'The badges feature is opt-in: it is off by default and only enabled if you turn it on in Settings.',
  //     'These counters never leave your device, are never tied to a user identity, and never include the contents of your messages.',
  //     'Future cross-device sync, if we add it, would use end-to-end encryption with a passphrase only you hold — your badges would never be readable by us or anyone else.',
  //   ],
  // },
  {
    label: 'DEVICE IDENTITY',
    items: [
      'A unique Ed25519 keypair is generated on this device the first time you launch the app.',
      'The private key never leaves this device. Only signatures it produces are sent, and only to your gateway, in response to its connection challenge.',
    ],
  },
  {
    label: 'FEEDBACK & DIAGNOSTICS',
    items: [
      'Nothing leaves the app unless you tap "Report a bug / Request a feature".',
      'When you submit feedback, your message — plus optional diagnostics (app version, build, OS, device model, locale, and connection state) — is sent to a Cloudflare Worker we run, which files a GitHub issue in a private repository visible only to the ClawBoy team.',
      'Any screenshots you attach are uploaded to that same private repository. Only the ClawBoy team can view them.',
      'Diagnostics never include your gateway URL, auth tokens, or message content.',
      'You can optionally attach the most recent in-memory console log entries. These are scrubbed before leaving your device using a two-layer redactor (key-name filter + regex patterns that strip URLs, tokens, JWTs, device IDs, hex/base64 blobs, and UUIDs). Scrubbing is best-effort — review the in-app preview before enabling this.',
      'If a crash from the previous session is detected, the feedback form pre-fills the title and body with the error type and message. You can edit or clear this before sending. The React component stack stays encrypted on your device and is never transmitted.',
    ],
  },
  {
    label: 'OVER-THE-AIR UPDATES',
    items: [
      'New JavaScript bundles are downloaded from Expo\'s update servers and verified with code-signing before they run.',
      'This is the only routine network request the app makes that isn\'t to your gateway.',
    ],
  },
  {
    label: 'WHAT WE DON\'T DO',
    items: [
      'No off-device analytics, telemetry, or behavioral tracking.',
      'No automatic crash uploads — crashes are stored locally and only transmitted if you actively choose to send a report.',
      'No third-party crash reporting SDKs (no Sentry, no Bugsnag). Crash data never goes to third parties.',
      'No advertising SDKs and no device fingerprinting.',
      'No remote code execution beyond signed Expo update bundles.',
      'No silent re-pairing — if your device\'s identity is ever rejected, we stop and ask you what to do.',
    ],
  },
];

function PrivacySecurityCard({ colors }: { colors: ThemeColors }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const sections = useMemo((): PrivacySection[] => {
    if (i18n.language.startsWith('zh')) {
      const parsed = parseLabelItemSections(t('about.privacySections', { returnObjects: true }));
      if (parsed.length > 0) return parsed;
    }
    return DEFAULT_PRIVACY_SECTIONS;
  }, [i18n.language, t]);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: Spacing.md }]}>
      <CollapsibleSection
        header={
          <View style={styles.privacyHeaderContent}>
            <ShieldCheck size={16} color={colors.mutedForeground} />
            <Text style={[styles.privacyTitle, { color: colors.foreground }]}>{t('about.privacySecurity')}</Text>
          </View>
        }
        colors={colors}
        fadeColor={colors.card}
        previewMaxHeight={130}
      >
        {sections.map((section) => (
          <View key={section.label}>
            <Divider color={colors.border} />
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{section.label}</Text>
            <View style={styles.itemList}>
              {section.items.map((item, ii) => (
                <View key={ii} style={styles.bulletRow}>
                  <Text style={[styles.bullet, { color: colors.mutedForeground }]}>{'•'}</Text>
                  <Text style={[styles.bulletText, { color: colors.foreground }]}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </CollapsibleSection>
    </View>
  );
}

// ── LegalLinksCard ─────────────────────────────────────────────────────────

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
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Pressable
        onPress={() => { void WebBrowser.openBrowserAsync(TERMS_URL); }}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
        accessibilityRole="link"
        accessibilityLabel={t('about.termsOfService')}
      >
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{t('about.termsOfService')}</Text>
        <ChevronRight size={14} color={colors.mutedForeground} />
      </Pressable>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
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

// ── ThreatModelCard ────────────────────────────────────────────────────────

type ThreatSection = LabelItemsSection;

const DEFAULT_THREAT_SECTIONS: ThreatSection[] = [
  {
    label: 'WHAT CLAWBOY PROTECTS TODAY',
    items: [
      'All connections default to encrypted TLS (wss://). The app warns loudly if you enter a ws:// or http:// URL.',
      'Gateway tokens, your device\'s Ed25519 private key, and the chat-cache encryption key are stored in the iOS Keychain / Android Keystore via Expo SecureStore. They never touch plain app storage.',
      'A unique Ed25519 keypair is generated on this device and never exported. Only signatures it produces are transmitted — and only to your gateway.',
      'Per-device pairing requires explicit human approval on the gateway. A stolen bearer token cannot pair a new device without also possessing the private key.',
      'ClawBoy does not proxy, relay, or log your traffic. Conversations travel directly between this device and the gateway you configured.',
      'No analytics SDKs, no crash reporters, no third-party telemetry of any kind.',
    ],
  },
  {
    label: 'THREATS WE MITIGATE WELL',
    items: [
      'Passive eavesdropping on hostile Wi-Fi (covered by TLS).',
      'ISP-level or network-level snooping (covered by TLS + direct connection to your server).',
      'Stolen bearer token reuse — the device identity keypair prevents a new device from authenticating, so a leaked token alone is not sufficient.',
      'Session hijacking of unpaired devices — the handshake requires a valid Ed25519 signature that can only be produced on this device.',
      'Insecure-transport footguns — the app blocks saving ws:// URLs without an explicit acknowledgement.',
      'TLS-inspecting corporate proxies and rogue CAs — when certificate pinning is enabled. After your first connection, ClawBoy records the gateway\'s certificate public key. Promote it to a pin in Settings → Connection → Pinned Keys and the app will block any connection whose cert doesn\'t match, before any credentials are sent.',
      'MDM-installed root CAs — when pinning is enabled, the OS CA store is bypassed entirely for this connection.',
    ],
  },
  {
    label: 'THREATS WE DON\'T FULLY MITIGATE WITHOUT PINNING',
    items: [
      'TLS-inspecting corporate proxies. Enterprise TLS-inspection tools (Zscaler, Netskope, Palo Alto) present a CA-signed certificate that the OS trusts. Without pinning, we cannot distinguish that from a real connection.',
      'MDM-installed root CAs. A managed device may have additional CAs installed by an IT administrator that can sign for any hostname.',
      'Rogue or compromised public certificate authorities. The public CA system contains hundreds of issuers; a compromised or coerced CA can produce a valid cert for your gateway hostname.',
      'State-level adversaries with CA coercion authority.',
      'Enable certificate pinning in Settings → Connection → Pinned Keys to close all of these gaps.',
    ],
  },
  {
    label: 'WHAT YOU CAN DO TODAY',
    items: [
      'Enable certificate pinning. After your first connection ClawBoy records the gateway\'s certificate public key — go to Settings → Connection → Pinned Keys and tap "Pin" to activate enforcement.',
      'Run your gateway behind Tailscale, WireGuard, or Cloudflare Tunnel for an additional layer of protection that eliminates the public-internet hop where a proxy could sit.',
      'Avoid installing ClawBoy on a managed or corporate device whose MDM configuration is outside your control, unless pinning is enabled.',
      'When approving a new device on your gateway, verify the device fingerprint shown in the ClawBoy pairing screen matches what the gateway reports.',
      'Rotate your gateway token immediately if you suspect it has been compromised.',
      'Keep both the app and your OpenClaw gateway up to date.',
    ],
  },
  {
    label: 'WHAT WE WILL NEVER DO',
    items: [
      'Proxy, relay, or read your conversations.',
      'Log or transmit message contents off-device without your explicit action.',
      'Automatically upload crash reports, analytics, or any data without a deliberate user opt-in.',
      'Include advertising, analytics, or device-fingerprinting SDKs.',
      'Execute code from remote sources beyond signed Expo OTA update bundles.',
      'Store credentials in plain app storage.',
    ],
  },
];

function ThreatModelCard({ colors }: { colors: ThemeColors }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const sections = useMemo((): ThreatSection[] => {
    if (i18n.language.startsWith('zh')) {
      const parsed = parseLabelItemSections(t('about.threatSections', { returnObjects: true }));
      if (parsed.length > 0) return parsed;
    }
    return DEFAULT_THREAT_SECTIONS;
  }, [i18n.language, t]);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: Spacing.md }]}>
      <CollapsibleSection
        header={
          <View style={styles.privacyHeaderContent}>
            <Shield size={16} color={colors.mutedForeground} />
            <Text style={[styles.privacyTitle, { color: colors.foreground }]}>{t('about.threatModel')}</Text>
          </View>
        }
        colors={colors}
        fadeColor={colors.card}
        previewMaxHeight={130}
      >
        {sections.map((section) => (
          <View key={section.label}>
            <Divider color={colors.border} />
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{section.label}</Text>
            <View style={styles.itemList}>
              {section.items.map((item, ii) => (
                <View key={ii} style={styles.bulletRow}>
                  <Text style={[styles.bullet, { color: colors.mutedForeground }]}>{'•'}</Text>
                  <Text style={[styles.bulletText, { color: colors.foreground }]}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </CollapsibleSection>
    </View>
  );
}

// ── DebugFeedbackCard ──────────────────────────────────────────────────────

function DebugFeedbackCard({
  colors,
  bypassStatus,
  onStatusChange,
  onHide,
}: {
  colors: ThemeColors;
  bypassStatus: DevBypassTokenStatus;
  onStatusChange: () => void;
  onHide: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    setError(null);
    const trimmed = input.trim();
    if (trimmed.length < DEV_BYPASS_TOKEN_MIN_LENGTH) {
      setError(t('about.debug.feedbackBypass.errorTooShort'));
      return;
    }
    setSaving(true);
    try {
      await setDevBypassToken(trimmed);
      setInput('');
      onStatusChange();
    } catch (err) {
      setError(translateClawError(err));
    } finally {
      setSaving(false);
    }
  }, [input, onStatusChange, t]);

  const handleClear = useCallback(() => {
    Alert.alert(
      t('about.debug.feedbackBypass.clear'),
      t('about.debug.feedbackBypass.statusNotSet'),
      [
        { text: t('feedback.discardBtn'), style: 'destructive', onPress: () => {
          void clearDevBypassToken().then(onStatusChange);
        }},
        { text: t('feedback.keepEditing'), style: 'cancel' },
      ],
    );
  }, [onStatusChange, t]);

  return (
    <View style={[styles.card, debugStyles.card, { backgroundColor: colors.card, borderColor: colors.warning }]}>
      {/* Header row */}
      <View style={[styles.row, debugStyles.headerRow]}>
        <Text style={[debugStyles.title, { color: colors.warning }]}>
          {t('about.debug.feedbackBypass.title')}
        </Text>
        <Pressable
          onPress={onHide}
          style={({ pressed }) => [debugStyles.hideBtn, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={t('about.debug.feedbackBypass.hide')}
        >
          <Text style={[debugStyles.hideBtnText, { color: colors.mutedForeground }]}>
            {t('about.debug.feedbackBypass.hide')}
          </Text>
        </Pressable>
      </View>

      <Divider color={colors.border} />

      {/* Status */}
      <View style={[styles.row, { paddingVertical: 8 }]}>
        <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>
          {bypassStatus.set
            ? t('about.debug.feedbackBypass.statusSet')
            : t('about.debug.feedbackBypass.statusNotSet')}
        </Text>
        {bypassStatus.preview != null && (
          <Text style={[styles.metaValue, styles.metaMono, { color: colors.foreground }]}>
            {bypassStatus.preview}
          </Text>
        )}
      </View>

      <Divider color={colors.border} />

      {/* Input + Save */}
      <View style={debugStyles.inputRow}>
        <TextInput
          style={[debugStyles.input, { color: colors.foreground, borderColor: error ? colors.destructive : colors.border, backgroundColor: colors.background }]}
          placeholder={t('about.debug.feedbackBypass.placeholder')}
          placeholderTextColor={colors.mutedForeground}
          value={input}
          onChangeText={(v) => { setInput(v); setError(null); }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
        />
        <Pressable
          onPress={() => { void handleSave(); }}
          disabled={saving || input.trim().length === 0}
          style={({ pressed }) => [
            debugStyles.saveBtn,
            { backgroundColor: colors.primary, opacity: pressed || saving || input.trim().length === 0 ? 0.5 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('about.debug.feedbackBypass.save')}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={debugStyles.saveBtnText}>{t('about.debug.feedbackBypass.save')}</Text>}
        </Pressable>
      </View>

      {error != null && (
        <Text style={[debugStyles.errorText, { color: colors.destructive }]}>{error}</Text>
      )}

      {/* Clear */}
      {bypassStatus.set && (
        <>
          <Divider color={colors.border} />
          <Pressable
            onPress={handleClear}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={t('about.debug.feedbackBypass.clear')}
          >
            <Text style={[styles.rowLabel, { color: colors.destructive }]}>
              {t('about.debug.feedbackBypass.clear')}
            </Text>
          </Pressable>
        </>
      )}

      <Divider color={colors.border} />

      {/* Footer note */}
      <Text style={[debugStyles.footerNote, { color: colors.mutedForeground }]}>
        {t('about.debug.feedbackBypass.footerNote')}
      </Text>
    </View>
  );
}

const debugStyles = StyleSheet.create({
  card: {
    marginTop: Spacing.md,
    borderWidth: 1,
  },
  headerRow: {
    justifyContent: 'space-between',
  },
  title: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.4,
    flex: 1,
  },
  hideBtn: {
    paddingVertical: 2,
    paddingLeft: 12,
  },
  hideBtnText: {
    fontSize: FontSize.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    height: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 10,
    fontSize: FontSize.sm,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  saveBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  errorText: {
    fontSize: FontSize.xs,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  footerNote: {
    fontSize: FontSize.xs,
    lineHeight: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  fieldLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.md, paddingTop: Spacing.xs },
  logoWrap: { alignItems: 'center', marginBottom: Spacing.sm },
  logo: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: { width: '100%', height: '100%' },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  metaLabel: { fontSize: FontSize.sm, width: 80 },
  metaValue: { flex: 1, fontSize: FontSize.sm, textAlign: 'right' },
  metaMono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
  },
  restartBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
    minWidth: 64,
    alignItems: 'center',
  },
  // Collapsible
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  collapsibleHeaderContent: {
    flex: 1,
  },
  collapsibleBody: {
    position: 'relative',
    alignSelf: 'stretch',
  },
  fadeGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 52,
  },
  chevronToggleRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // Changelog section
  changelogOuter: {
    marginTop: Spacing.xl,
  },
  collapsibleSectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  // Privacy card
  privacyHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  privacyTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  // Changelog entry card
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  entryVersion: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  entryDate: {
    fontSize: FontSize.xs,
  },
  emptyNote: {
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  itemList: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  bullet: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    width: 10,
  },
  bulletMarkdownWrap: {
    flex: 1,
    minWidth: 0,
  },
  bulletText: {
    flex: 1,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  threatModelLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  threatModelLinkText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  // Footnote
  footnote: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    alignItems: 'center',
  },
  footnoteText: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  footnoteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  footnoteLink: {
    fontSize: FontSize.xs,
    textDecorationLine: 'none',
    borderBottomWidth: 1,
  },
});
