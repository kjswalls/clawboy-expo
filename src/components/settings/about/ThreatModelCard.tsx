import React, { useCallback, useMemo } from 'react';
import { Text, View } from 'react-native';
import { Shield } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import { CollapsibleSection } from '@/components/common/CollapsibleSection';
import { Divider, parseLabelItemSections, styles, type LabelItemsSection } from './aboutStyles';
import { LabelItemsCollapsiblePreview } from './ChangelogSection';

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

export function ThreatModelCard({ colors }: { colors: ThemeColors }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const sections = useMemo((): ThreatSection[] => {
    if (i18n.language.startsWith('zh')) {
      const parsed = parseLabelItemSections(t('about.threatSections', { returnObjects: true }));
      if (parsed.length > 0) return parsed;
    }
    return DEFAULT_THREAT_SECTIONS;
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
            <Shield size={16} color={colors.mutedForeground} />
            <Text style={[styles.privacyTitle, { color: colors.foreground }]}>{t('about.threatModel')}</Text>
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
