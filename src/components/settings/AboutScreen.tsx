import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Updates from 'expo-updates';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ChevronDown, RefreshCw, Shield, ShieldCheck } from 'lucide-react-native';
import Markdown from '@ronradtke/react-native-markdown-display';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslation } from 'react-i18next';

import { APP_VERSION, BUILD_NUMBER, UPDATE_ID } from '@/lib/appMeta';
import { SettingsTipJarSection } from './SettingsTipJarSection';
import { hexToRgba } from '@/utils/color';
import { CHANGELOG_ENTRIES } from '@/constants/changelog';
import type { ChangelogEntry } from '@/constants/changelog';
import { useTheme } from '@/hooks/useTheme';
import { changelogMarkdownIt, createChangelogItemMarkdownStyles } from '@/utils/markdownTheme';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import i18n from '@/i18n';

// ── Helpers ────────────────────────────────────────────────────────────────

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

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function AboutScreen({ visible, onClose }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ kind: 'idle' });
  const [reloading, setReloading] = useState(false);

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
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={onClose}
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
          {/* Logo mark */}
          <View style={styles.logoWrap}>
            <View style={[styles.logo, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.logoText, { color: colors.primary }]}>CB</Text>
            </View>
          </View>

          {/* App identity */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MetaRow label={t('about.version')} value={APP_VERSION} mono colors={{ fg: colors.foreground, muted: colors.mutedForeground }} />
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

          {/* Privacy and Security */}
          <PrivacySecurityCard colors={colors} />

          {/* Security & Threat Model */}
          <ThreatModelCard colors={colors} />

          {/* Changelog */}
          <ChangelogSection colors={colors} />

          {/* Tip the Developer */}
          <View style={{ marginTop: Spacing.xl }}>
            <SettingsTipJarSection />
          </View>
        </ScrollView>
      </View>
    </Modal>
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
  const { t } = useTranslation();
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
        {CHANGELOG_ENTRIES.map((entry, i) => (
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

type PrivacySection = {
  label: string;
  items: string[];
};

const PRIVACY_SECTIONS: PrivacySection[] = [
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
      'When you do, your message — plus optional diagnostics (app version, build, OS, device model, locale) — is sent to a Cloudflare Worker we run, which files a public GitHub issue.',
      'Any screenshots you attach are uploaded to a public GitHub repository so they can be embedded in the issue. Treat them as public — don\'t attach screenshots of sensitive content.',
      'Diagnostics never include your gateway URL, tokens, or message contents.',
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
      'No third-party crash reporting (no Sentry, no Bugsnag).',
      'No advertising SDKs and no device fingerprinting.',
      'No remote code execution beyond signed Expo update bundles.',
      'No silent re-pairing — if your device\'s identity is ever rejected, we stop and ask you what to do.',
    ],
  },
];

function PrivacySecurityCard({ colors }: { colors: ThemeColors }): React.JSX.Element {
  const { t } = useTranslation();
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
        {PRIVACY_SECTIONS.map((section) => (
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

// ── ThreatModelCard ────────────────────────────────────────────────────────

interface ThreatSection {
  label: string;
  items: string[];
}

const THREAT_SECTIONS: ThreatSection[] = [
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
      'Log message contents off-device.',
      'Include advertising, analytics, or device-fingerprinting SDKs.',
      'Execute code from remote sources beyond signed Expo OTA update bundles.',
      'Store credentials in plain app storage.',
    ],
  },
];

function ThreatModelCard({ colors }: { colors: ThemeColors }): React.JSX.Element {
  const { t } = useTranslation();
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
        {THREAT_SECTIONS.map((section) => (
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

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.md, paddingTop: Spacing.lg },
  logoWrap: { alignItems: 'center', marginBottom: Spacing.lg },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontSize: 32, fontWeight: '800' as const },
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
