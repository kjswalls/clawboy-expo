/**
 * PinnedKeysScreen — Settings → Server → Pinned Keys
 *
 * Allows users to view, add, and remove pinned SPKI SHA-256 hashes for a
 * specific server profile. Accessed from the server detail section in Settings.
 */

import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Copy, Pin, Plus, Shield, Trash2, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import type { ServerProfile } from '@/types';

interface PinnedKeysScreenProps {
  visible: boolean;
  profile: ServerProfile;
  onClose: () => void;
  onUpdatePins: (profileId: string, newPins: string[]) => Promise<void>;
}

export function PinnedKeysScreen({
  visible,
  profile,
  onClose,
  onUpdatePins,
}: PinnedKeysScreenProps): React.JSX.Element {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [addingPin, setAddingPin] = useState(false);
  const [newPinInput, setNewPinInput] = useState('');
  const [introExpanded, setIntroExpanded] = useState(false);
  const [rotationExpanded, setRotationExpanded] = useState(false);
  const [pinConfirmVisible, setPinConfirmVisible] = useState(false);

  const pins = profile.security?.pinnedSpkiSha256 ?? [];
  const firstSeen = profile.security?.firstSeenSpkiSha256;
  const firstSeenAt = profile.security?.firstSeenAt;

  const handleRemovePin = (pin: string): void => {
    Alert.alert(
      'Remove pin?',
      `Remove this key from the pinned set?\n\n${pin}\n\nIf no pins remain, the app will use TOFU observation only.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const next = pins.filter((p) => p !== pin);
            void onUpdatePins(profile.id, next);
          },
        },
      ]
    );
  };

  const handleAddPin = (): void => {
    let trimmed = newPinInput.trim();

    // Accept base64 (44 chars with optional padding) → convert to hex.
    if (/^[A-Za-z0-9+/]{43}={0,1}$/.test(trimmed)) {
      const bytes = Uint8Array.from(atob(trimmed), (c) => c.charCodeAt(0));
      trimmed = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    } else {
      // Strip non-hex separators (colons, spaces, etc.) and lowercase.
      trimmed = trimmed.replace(/[^0-9a-f]/gi, '').toLowerCase();
    }

    if (!/^[0-9a-f]{64}$/.test(trimmed)) {
      Alert.alert('Invalid pin', 'Expected a 64-character hex or 44-character base64 SHA-256 hash.');
      return;
    }
    if (pins.includes(trimmed)) {
      Alert.alert('Already pinned', 'This key is already in the pinned set.');
      return;
    }
    void onUpdatePins(profile.id, [...pins, trimmed]);
    setNewPinInput('');
    setAddingPin(false);
  };

  const formatDate = (ms: number | null | undefined): string => {
    if (!ms) return 'Unknown';
    return new Date(ms).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const formatFingerprint = (hex: string): string =>
    hex.match(/.{1,8}/g)?.join(' ') ?? hex;

  const handlePinTofu = (): void => {
    if (!firstSeen) return;
    setPinConfirmVisible(true);
  };

  const handleConfirmPin = (): void => {
    if (!firstSeen) return;
    setPinConfirmVisible(false);
    void onUpdatePins(profile.id, [...pins, firstSeen]);
  };

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
            accessibilityLabel="Close pinned keys screen"
            accessibilityRole="button"
          >
            <ArrowLeft size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Pinned Keys</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom + Spacing.lg, 32) }]}
          showsVerticalScrollIndicator={false}
        >
          {/* First-seen TOFU record */}
          {firstSeen ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TOFU Record</Text>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Trust On First Use</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.hashRow}>
                <View style={styles.hashInfo}>
                  <Text style={[styles.hashValue, { color: colors.foreground }]}>
                    {formatFingerprint(firstSeen)}
                  </Text>
                  <Text style={[styles.hashMeta, { color: colors.mutedForeground }]}>
                    First seen {formatDate(firstSeenAt)}
                  </Text>
                </View>
                {!pins.includes(firstSeen) ? (
                  <Pressable
                    onPress={handlePinTofu}
                    style={({ pressed }) => [
                      styles.pinBtn,
                      { borderColor: `${colors.foreground}30`, opacity: pressed ? 0.7 : 1 },
                    ]}
                    accessibilityLabel="Pin this key"
                    accessibilityRole="button"
                  >
                    <Pin size={11} color={colors.foreground} />
                    <Text style={[styles.pinBtnText, { color: colors.foreground }]}>Pin</Text>
                  </Pressable>
                ) : (
                  <Text style={[styles.pinnedBadge, { color: colors.success }]}>Pinned ✓</Text>
                )}
              </View>
            </View>
          ) : null}

          {/* Active pins */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: firstSeen ? Spacing.md : 0 }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                Active Pins ({pins.length})
              </Text>
              <Pressable
                onPress={() => setAddingPin(!addingPin)}
                style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
                accessibilityLabel="Add a pin manually"
                accessibilityRole="button"
              >
                <Plus size={14} color={colors.primary} />
                <Text style={[styles.addBtnText, { color: colors.primary }]}>Add manually</Text>
              </Pressable>
            </View>

            {addingPin ? (
              <View style={[styles.addPinBlock, { borderColor: colors.border }]}>
                <Text style={[styles.addPinLabel, { color: colors.mutedForeground }]}>
                  Paste the SHA-256 SPKI hash from your gateway server. Accepts 64-char hex, base64, or hex with colon separators.
                </Text>
                <TextInput
                  value={newPinInput}
                  onChangeText={setNewPinInput}
                  placeholder="0a1b2c3d…"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                  style={[
                    styles.addPinInput,
                    { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
                  ]}
                />
                <View style={styles.addPinActions}>
                  <Pressable
                    onPress={handleAddPin}
                    style={({ pressed }) => [
                      styles.addPinConfirmBtn,
                      { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.addPinConfirmText, { color: colors.primaryForeground }]}>Add pin</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { setAddingPin(false); setNewPinInput(''); }}
                    style={({ pressed }) => [styles.addPinCancelBtn, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.addPinCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {pins.length === 0 ? (
              <View style={styles.emptyPins}>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No keys pinned. The app records your gateway&apos;s certificate fingerprint on first
                  connection, but won&apos;t block mismatches until you add at least one pin above.
                </Text>
              </View>
            ) : (
              pins.map((pin, idx) => (
                <View key={pin}>
                  {idx > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
                  <View style={styles.hashRow}>
                    <View style={styles.hashInfo}>
                      <Text style={[styles.hashValue, { color: colors.foreground }]}>{pin}</Text>
                    </View>
                    <Pressable
                      onPress={() => handleRemovePin(pin)}
                      style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.7 }]}
                      accessibilityLabel={`Remove pin ${pin.slice(-4)}`}
                      accessibilityRole="button"
                    >
                      <Trash2 size={14} color={colors.destructive} />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Why pin certificates? (collapsible explainer) */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: Spacing.md }]}>
            <Pressable
              onPress={() => setIntroExpanded((v) => !v)}
              style={styles.rotationHeader}
              accessibilityRole="button"
              accessibilityLabel="Why pin certificates?"
            >
              <Shield size={14} color={colors.mutedForeground} />
              <Text style={[styles.rotationTitle, { color: colors.mutedForeground, flex: 1 }]}>
                Why pin certificates?
              </Text>
              {introExpanded
                ? <ChevronDown size={14} color={colors.mutedForeground} />
                : <ChevronRight size={14} color={colors.mutedForeground} />}
            </Pressable>
            {introExpanded ? (
              <View style={[styles.rotationBody, { paddingHorizontal: 12, paddingBottom: 12, gap: 8 }]}>
                <Text style={[styles.introText, { color: colors.mutedForeground }]}>
                  Every TLS certificate has a public key. "Pinning" records the fingerprint of that public key from the TLS certificate on your OpenClaw server, and compares it to the fingerprint of the certificate you&apos;re connecting to, every time you connect. If the fingerprints don&apos;t match, ClawBoy refuses to connect.
                </Text>
                <Text style={[styles.introText, { color: colors.mutedForeground }]}>
                  Without pinning, any certificate authority in your OS trust store can issue a
                  certificate for your gateway hostname, impersonating your server. This can be done by corporate proxies (Zscaler,
                  Netskope) and MDM-installed CAs. Pinning makes that impossible.
                </Text>
                <Text style={[styles.introText, { color: colors.mutedForeground }]}>
                  <Text style={{ fontWeight: FontWeight.semibold }}>You don&apos;t need to enable this</Text> to connect to your OpenClaw server. But if you do, and if your server&apos;s certificate ever changes legitimately (renewal, key
                  rotation), you&apos;ll need to update the pin here before you can reconnect.
                </Text>
              </View>
            ) : null}
          </View>

          {/* When does my certificate change? */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: Spacing.md }]}>
            <Pressable
              onPress={() => setRotationExpanded((v) => !v)}
              style={styles.rotationHeader}
              accessibilityRole="button"
              accessibilityLabel="What is certificate rotation and when does it happen?"
            >
              {rotationExpanded
                ? <ChevronDown size={14} color={colors.mutedForeground} />
                : <ChevronRight size={14} color={colors.mutedForeground} />}
              <Text style={[styles.rotationTitle, { color: colors.mutedForeground }]}>
                When does my certificate change?
              </Text>
            </Pressable>
            {rotationExpanded ? (
              <View style={styles.rotationBody}>
                <RotationRow
                  title="Let's Encrypt on a VPS (most common)"
                  body={"Let's Encrypt certificates expire every 90 days. Most server setups (Caddy, nginx + certbot, Traefik) renew them automatically. The domain name stays the same but the key pair is regenerated, so the fingerprint changes.\n\nIf ClawBoy blocks your connection after 90 days, this is almost certainly why. Go to Settings → Pinned Keys, tap the new hash in the TOFU record, and pin it."}
                  colors={colors}
                />
                <RotationDivider color={colors.border} />
                <RotationRow
                  title="Self-signed certificate (home server)"
                  body={"If you generated your own cert with openssl, it rotates only when you explicitly run the command again. You control when this happens — just remember to update the pin here after you do."}
                  colors={colors}
                />
                <RotationDivider color={colors.border} />
                <RotationRow
                  title="Tailscale (tailnet / MagicDNS)"
                  body={"Tailscale issues its own certificates for .ts.net hostnames via HTTPS. These are managed by Tailscale and rotate on their schedule. If pinning is active and your Tailscale cert rotates, you'll see a pin mismatch screen. Promote the new TOFU record to a pin to continue."}
                  colors={colors}
                />
                <RotationDivider color={colors.border} />
                <RotationRow
                  title="Cloudflare Tunnel"
                  body={"The TLS certificate Cloudflare presents to ClawBoy is Cloudflare's own edge certificate, not your origin certificate. Pinning a Cloudflare edge cert is fragile — Cloudflare rotates these without warning. If you use Cloudflare Tunnel, pinning is less useful and may break unexpectedly. Consider running your gateway behind Tailscale instead if you want reliable pinning."}
                  colors={colors}
                />
                <RotationDivider color={colors.border} />
                <RotationRow
                  title="OpenClaw-managed certificate"
                  body={"If OpenClaw handles certificate management for you (depends on your deployment mode), check your gateway's admin panel or docs for how often certificates rotate and whether rotation generates a new key pair."}
                  colors={colors}
                />
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>

      {/* Pin confirmation sheet */}
      {pinConfirmVisible && firstSeen ? (
        <PinConfirmSheet
          hostname={profile.url}
          fingerprint={firstSeen}
          onCancel={() => setPinConfirmVisible(false)}
          onConfirm={handleConfirmPin}
          colors={colors}
          insets={insets}
        />
      ) : null}
    </Modal>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function RotationRow({
  title,
  body,
  colors,
}: {
  title: string;
  body: string;
  colors: ReturnType<typeof useTheme>['colors'];
}): React.JSX.Element {
  return (
    <View style={rotationRowStyles.wrap}>
      <Text style={[rotationRowStyles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[rotationRowStyles.body, { color: colors.mutedForeground }]}>{body}</Text>
    </View>
  );
}

function RotationDivider({ color }: { color: string }): React.JSX.Element {
  return <View style={[rotationRowStyles.divider, { backgroundColor: color }]} />;
}

// ── PinConfirmSheet ─────────────────────────────────────────────────────────

function buildOpensslCommand(rawUrl: string): string {
  let host = rawUrl;
  try {
    // Normalise ws/wss → https so URL() can parse it.
    const normalized = rawUrl.startsWith('ws') ? rawUrl.replace(/^ws/, 'http') : `https://${rawUrl}`;
    const parsed = new URL(normalized);
    // Honour an explicit port; fall back to 443.
    host = parsed.hostname + (parsed.port ? `:${parsed.port}` : ':443');
  } catch {
    // Keep whatever was passed in; the user can edit it.
  }
  return (
    `openssl s_client -connect ${host} \\\n` +
    `  </dev/null 2>/dev/null \\\n` +
    `  | openssl x509 -noout -pubkey \\\n` +
    `  | openssl pkey -pubin -outform DER \\\n` +
    `  | openssl dgst -sha256 -hex`
  );
}

function PinConfirmSheet({
  hostname,
  fingerprint,
  onCancel,
  onConfirm,
  colors,
  insets,
}: {
  hostname: string;
  fingerprint: string;
  onCancel: () => void;
  onConfirm: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
  insets: { bottom: number };
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const opensslCommand = React.useMemo(() => buildOpensslCommand(hostname), [hostname]);

  const handleCopy = (): void => {
    void Clipboard.setStringAsync(opensslCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={confirmStyles.backdrop} onPress={onCancel}>
        <Pressable
          style={[confirmStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => { /* swallow taps so backdrop doesn't close */ }}
        >
          {/* Title */}
          <Text style={[confirmStyles.title, { color: colors.foreground }]}>
            Pin this certificate?
          </Text>

          {/* Consequence */}
          <Text style={[confirmStyles.body, { color: colors.mutedForeground }]}>
            Once pinned, ClawBoy will refuse to connect if your server{"'"}s certificate fingerprint ever changes — including on legitimate renewals or key rotations. You{"'"}d need to come back here and pin the updated fingerprint to reconnect.
          </Text>

          {/* Verify section */}
          <View style={[confirmStyles.verifyBlock, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Text style={[confirmStyles.sectionLabel, { color: colors.mutedForeground }]}>
              Verify before pinning
            </Text>
            <Text style={[confirmStyles.verifyBody, { color: colors.mutedForeground }]}>
              The OpenClaw gateway doesn{"'"}t display this fingerprint in its UI. Run this from any machine that can reach your server, then compare the output to the fingerprint shown below:
            </Text>
            {/* Code block */}
            <View style={[confirmStyles.codeBlock, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[confirmStyles.codeText, { color: colors.foreground }]} selectable>
                {opensslCommand}
              </Text>
              <Pressable
                onPress={handleCopy}
                style={({ pressed }) => [
                  confirmStyles.copyBtn,
                  { borderColor: `${colors.foreground}40`, opacity: pressed ? 0.7 : 1 },
                ]}
                accessibilityLabel="Copy openssl command"
                accessibilityRole="button"
              >
                {copied
                  ? <Check size={12} color={colors.success} />
                  : <Copy size={12} color={colors.mutedForeground} />}
                <Text style={[confirmStyles.copyBtnText, { color: copied ? colors.success : colors.mutedForeground }]}>
                  {copied ? 'Copied' : 'Copy'}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* TOFU fingerprint — compare against openssl output */}
          <View style={[confirmStyles.verifyBlock, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Text style={[confirmStyles.sectionLabel, { color: colors.mutedForeground }]}>
              Key fingerprint to match
            </Text>
            <Text style={[confirmStyles.codeText, { color: colors.foreground }]} selectable>
              {fingerprint.match(/.{1,8}/g)?.join(' ') ?? fingerprint}
            </Text>
          </View>

          {/* Actions */}
          <View style={[confirmStyles.actions, { paddingBottom: Math.max(insets.bottom, 4) }]}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                confirmStyles.actionBtn,
                { backgroundColor: pressed ? colors.secondary : 'transparent' },
              ]}
              accessibilityRole="button"
            >
              <X size={14} color={colors.primary} />
              <Text style={[confirmStyles.actionBtnText, { color: colors.foreground }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [
                confirmStyles.actionBtn,
                { backgroundColor: pressed ? colors.secondary : 'transparent' },
              ]}
              accessibilityLabel="Confirm pin this certificate"
              accessibilityRole="button"
            >
              <Pin size={14} color={colors.primary} />
              <Text style={[confirmStyles.actionBtnText, { color: colors.foreground }]}>Pin</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const confirmStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  sheet: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: 12,
  },
  title: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
  body: {
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  verifyBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.lg,
    padding: 12,
    gap: 8,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  verifyBody: {
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  codeBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.md,
    padding: 10,
    gap: 8,
  },
  codeText: {
    fontSize: 10,
    fontFamily: 'monospace',
    lineHeight: 17,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  copyBtnText: { fontSize: FontSize.xs, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 4,
    justifyContent: 'flex-end',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.md,
  },
  actionBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
});

const rotationRowStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  title: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, lineHeight: 18 },
  body: { fontSize: FontSize.xs, lineHeight: 18 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },
});

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
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  introText: { fontSize: FontSize.xs, lineHeight: 18 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addBtnText: { fontSize: FontSize.xs, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },
  hashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  hashInfo: { flex: 1, gap: 2 },
  hashValue: { fontSize: 10, fontFamily: 'monospace', lineHeight: 18 },
  hashMeta: { fontSize: FontSize.xs },
  pinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pinBtnText: { fontSize: FontSize.xs, fontWeight: '500' },
  pinnedBadge: { fontSize: FontSize.xs, fontWeight: '600' },
  removeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPins: { padding: 12 },
  emptyText: { fontSize: FontSize.xs, lineHeight: 18 },
  addPinBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 8,
  },
  addPinLabel: { fontSize: FontSize.xs, lineHeight: 18 },
  addPinInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: 8,
    fontSize: 10,
    fontFamily: 'monospace',
    minHeight: 48,
  },
  addPinActions: { flexDirection: 'row', gap: 8 },
  addPinConfirmBtn: {
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
  },
  addPinConfirmText: { fontSize: FontSize.xs, fontWeight: '700' },
  addPinCancelBtn: {
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
  },
  addPinCancelText: { fontSize: FontSize.xs },
  rotationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: Spacing.md,
  },
  rotationTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  rotationBody: {
    paddingBottom: 4,
  },
});
