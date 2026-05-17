import React, { useCallback, useMemo } from 'react';
import { Text, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import { CollapsibleSection } from '@/components/common/CollapsibleSection';
import { Divider, parseLabelItemSections, styles, type LabelItemsSection } from './aboutStyles';
import { LabelItemsCollapsiblePreview } from './ChangelogSection';

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

export function PrivacySecurityCard({ colors }: { colors: ThemeColors }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const sections = useMemo((): PrivacySection[] => {
    if (i18n.language.startsWith('zh')) {
      const parsed = parseLabelItemSections(t('about.privacySections', { returnObjects: true }));
      if (parsed.length > 0) return parsed;
    }
    return DEFAULT_PRIVACY_SECTIONS;
  }, [i18n.language, t]);

  const preview = useMemo(
    () => <LabelItemsCollapsiblePreview sections={sections} colors={colors} />,
    [sections, colors],
  );

  const renderExpanded = useCallback(
    () => (
      <>
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
      </>
    ),
    [sections, colors],
  );

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
        preview={preview}
        renderExpanded={renderExpanded}
      />
    </View>
  );
}
