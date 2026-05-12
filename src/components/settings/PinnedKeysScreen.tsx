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
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useTheme } from '@/hooks/useTheme';
import { useServerConfig } from '@/hooks/useServerConfig';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';

interface PinnedKeysScreenProps {
  profileId: string;
}

export function PinnedKeysScreen({ profileId }: PinnedKeysScreenProps): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { serverProfiles, updateProfileSecurity } = useServerConfig();
  const profile = serverProfiles.find((p) => p.id === profileId);
  const [addingPin, setAddingPin] = useState(false);
  const [newPinInput, setNewPinInput] = useState('');
  const [introExpanded, setIntroExpanded] = useState(false);
  const [rotationExpanded, setRotationExpanded] = useState(false);
  const [pinConfirmVisible, setPinConfirmVisible] = useState(false);

  if (!profile) {
    router.back();
    return null;
  }

  const onUpdatePins = (id: string, newPins: string[]): Promise<void> =>
    updateProfileSecurity(id, { pinnedSpkiSha256: newPins });

  const pins = profile.security?.pinnedSpkiSha256 ?? [];
  const firstSeen = profile.security?.firstSeenSpkiSha256;
  const firstSeenAt = profile.security?.firstSeenAt;

  const handleRemovePin = (pin: string): void => {
    Alert.alert(
      t('settings.pinnedKeys.removePinTitle'),
      t('settings.pinnedKeys.removePinBody', { pin }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.server.removeBtn'),
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
      Alert.alert(t('settings.pinnedKeys.invalidPinTitle'), t('settings.pinnedKeys.invalidPinBody'));
      return;
    }
    if (pins.includes(trimmed)) {
      Alert.alert(t('settings.pinnedKeys.alreadyPinnedTitle'), t('settings.pinnedKeys.alreadyPinnedBody'));
      return;
    }
    void onUpdatePins(profile.id, [...pins, trimmed]);
    setNewPinInput('');
    setAddingPin(false);
  };

  const formatDate = (ms: number | null | undefined): string => {
    if (!ms) return t('settings.pinnedKeys.unknownDate');
    return new Date(ms).toLocaleDateString(i18n.language, {
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
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityLabel={t('pinnedKeysEdu.closeLabel')}
          accessibilityRole="button"
        >
          <ArrowLeft size={18} color={colors.mutedForeground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('settings.pinnedKeys.title')}</Text>
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
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('settings.pinnedKeys.tofuRecord')}</Text>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('settings.pinnedKeys.trustOnFirstUse')}</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.hashRow}>
                <View style={styles.hashInfo}>
                  <Text style={[styles.hashValue, { color: colors.foreground }]}>
                    {formatFingerprint(firstSeen)}
                  </Text>
                  <Text style={[styles.hashMeta, { color: colors.mutedForeground }]}>
                    {t('settings.pinnedKeys.firstSeen', { date: formatDate(firstSeenAt) })}
                  </Text>
                </View>
                {!pins.includes(firstSeen) ? (
                  <Pressable
                    onPress={handlePinTofu}
                    style={({ pressed }) => [
                      styles.pinBtn,
                      { borderColor: `${colors.foreground}30`, opacity: pressed ? 0.7 : 1 },
                    ]}
                    accessibilityLabel={t('pinnedKeysEdu.pinThisKey')}
                    accessibilityRole="button"
                  >
                    <Pin size={11} color={colors.foreground} />
                    <Text style={[styles.pinBtnText, { color: colors.foreground }]}>{t('settings.pinnedKeys.pinBtn')}</Text>
                  </Pressable>
                ) : (
                  <Text style={[styles.pinnedBadge, { color: colors.success }]}>{t('settings.pinnedKeys.pinnedBadge')}</Text>
                )}
              </View>
            </View>
          ) : null}

          {/* Active pins */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: firstSeen ? Spacing.md : 0 }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                {t('settings.pinnedKeys.activePins', { count: pins.length })}
              </Text>
              <Pressable
                onPress={() => setAddingPin(!addingPin)}
                style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
                accessibilityLabel={t('settings.pinnedKeys.addManuallyLabel')}
                accessibilityRole="button"
              >
                <Plus size={14} color={colors.primary} />
                <Text style={[styles.addBtnText, { color: colors.primary }]}>{t('settings.pinnedKeys.addManually')}</Text>
              </Pressable>
            </View>

            {addingPin ? (
              <View style={[styles.addPinBlock, { borderColor: colors.border }]}>
                <Text style={[styles.addPinLabel, { color: colors.mutedForeground }]}>
                  {t('settings.pinnedKeys.addPinHint')}
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
                    <Text style={[styles.addPinConfirmText, { color: colors.primaryForeground }]}>{t('settings.pinnedKeys.addPinBtn')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { setAddingPin(false); setNewPinInput(''); }}
                    style={({ pressed }) => [styles.addPinCancelBtn, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.addPinCancelText, { color: colors.mutedForeground }]}>{t('common.cancel')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {pins.length === 0 ? (
              <View style={styles.emptyPins}>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  {t('settings.pinnedKeys.noPins')}
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
                      accessibilityLabel={t('settings.pinnedKeys.removePinLabel', { pin: pin.slice(-4) })}
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
              accessibilityLabel={t('pinnedKeysEdu.whyPinLabel')}
            >
              <Shield size={14} color={colors.mutedForeground} />
              <Text style={[styles.rotationTitle, { color: colors.mutedForeground, flex: 1 }]}>
                {t('pinnedKeysEdu.whyPinTitle')}
              </Text>
              {introExpanded
                ? <ChevronDown size={14} color={colors.mutedForeground} />
                : <ChevronRight size={14} color={colors.mutedForeground} />}
            </Pressable>
            {introExpanded ? (
              <View style={[styles.rotationBody, { paddingHorizontal: 12, paddingBottom: 12, gap: 8 }]}>
                <Text style={[styles.introText, { color: colors.mutedForeground }]}>
                  {t('pinnedKeysEdu.introBody1')}
                </Text>
                <Text style={[styles.introText, { color: colors.mutedForeground }]}>
                  {t('pinnedKeysEdu.introBody2')}
                </Text>
                <Text style={[styles.introText, { color: colors.mutedForeground }]}>
                  {t('pinnedKeysEdu.introBody3')}
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
              accessibilityLabel={t('pinnedKeysEdu.certChangeLabel')}
            >
              {rotationExpanded
                ? <ChevronDown size={14} color={colors.mutedForeground} />
                : <ChevronRight size={14} color={colors.mutedForeground} />}
              <Text style={[styles.rotationTitle, { color: colors.mutedForeground }]}>
                {t('pinnedKeysEdu.certChangeTitle')}
              </Text>
            </Pressable>
            {rotationExpanded ? (
              <View style={styles.rotationBody}>
                <RotationRow title={t('pinnedKeysEdu.letsEncryptTitle')} body={t('pinnedKeysEdu.letsEncryptBody')} colors={colors} />
                <RotationDivider color={colors.border} />
                <RotationRow title={t('pinnedKeysEdu.selfSignedTitle')} body={t('pinnedKeysEdu.selfSignedBody')} colors={colors} />
                <RotationDivider color={colors.border} />
                <RotationRow title={t('pinnedKeysEdu.tailscaleTitle')} body={t('pinnedKeysEdu.tailscaleBody')} colors={colors} />
                <RotationDivider color={colors.border} />
                <RotationRow title={t('pinnedKeysEdu.cloudflareTitle')} body={t('pinnedKeysEdu.cloudflareBody')} colors={colors} />
                <RotationDivider color={colors.border} />
                <RotationRow title={t('pinnedKeysEdu.openclawTitle')} body={t('pinnedKeysEdu.openclawBody')} colors={colors} />
              </View>
            ) : null}
          </View>
      </ScrollView>

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
    </View>
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
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const opensslCommand = React.useMemo(() => buildOpensslCommand(hostname), [hostname]);

  const handleCopy = (): void => {
    void Clipboard.setStringAsync(opensslCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Clear clipboard after 30 s per security rule §9
    setTimeout(() => { Clipboard.setStringAsync('').catch(() => {}); }, 30000);
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal={true}
    >
      <Pressable style={confirmStyles.backdrop} onPress={onCancel}>
        <Pressable
          style={[confirmStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => { /* swallow taps so backdrop doesn't close */ }}
        >
          {/* Title */}
          <Text style={[confirmStyles.title, { color: colors.foreground }]}>
            {t('pinnedKeysEdu.confirmTitle')}
          </Text>

          {/* Consequence */}
          <Text style={[confirmStyles.body, { color: colors.mutedForeground }]}>
            {t('pinnedKeysEdu.confirmBody')}
          </Text>

          {/* Verify section */}
          <View style={[confirmStyles.verifyBlock, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Text style={[confirmStyles.sectionLabel, { color: colors.mutedForeground }]}>
              {t('pinnedKeysEdu.verifyTitle')}
            </Text>
            <Text style={[confirmStyles.verifyBody, { color: colors.mutedForeground }]}>
              {t('pinnedKeysEdu.verifyBody')}
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
                accessibilityLabel={t('pinnedKeysEdu.copyOpenssl')}
                accessibilityRole="button"
              >
                {copied
                  ? <Check size={12} color={colors.success} />
                  : <Copy size={12} color={colors.mutedForeground} />}
                <Text style={[confirmStyles.copyBtnText, { color: copied ? colors.success : colors.mutedForeground }]}>
                  {copied ? t('pinnedKeysEdu.copied') : t('pinnedKeysEdu.copy')}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* TOFU fingerprint — compare against openssl output */}
          <View style={[confirmStyles.verifyBlock, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Text style={[confirmStyles.sectionLabel, { color: colors.mutedForeground }]}>
              {t('pinnedKeysEdu.fingerprintLabel')}
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
              <Text style={[confirmStyles.actionBtnText, { color: colors.foreground }]}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [
                confirmStyles.actionBtn,
                { backgroundColor: pressed ? colors.secondary : 'transparent' },
              ]}
              accessibilityLabel={t('pinnedKeysEdu.confirmPinLabel')}
              accessibilityRole="button"
            >
              <Pin size={14} color={colors.primary} />
              <Text style={[confirmStyles.actionBtnText, { color: colors.foreground }]}>{t('pinnedKeysEdu.pin')}</Text>
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
