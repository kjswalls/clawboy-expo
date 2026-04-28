/**
 * PinMismatchScreen — full-screen blocker shown when the gateway's certificate
 * SPKI hash does not match any pinned hash for the active server profile.
 *
 * The user must take an explicit action before the app will attempt another
 * connection. No data was sent to the gateway — the native layer rejected the
 * TLS handshake before any application frames were transmitted.
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
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';

interface PinMismatchScreenProps {
  visible: boolean;
  /** The SPKI SHA-256 hash observed from the gateway during the failed handshake. */
  observedSpki: string;
  /** The currently pinned SPKI hashes for this profile. */
  allowedSpkis: string[];
  /** Disconnect and do nothing — user must manually reconnect after investigating. */
  onReject: () => void;
  /** Add the observed SPKI to the pinned set and reconnect. */
  onApproveNewKey: (observedSpki: string) => void;
  /** Remove all pins and the profile's TOFU record — effectively "forget" the server. */
  onForgetServer: () => void;
}

export function PinMismatchScreen({
  visible,
  observedSpki,
  allowedSpkis,
  onReject,
  onApproveNewKey,
  onForgetServer,
}: PinMismatchScreenProps): React.JSX.Element {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [confirmInput, setConfirmInput] = useState('');
  const [verifyExpanded, setVerifyExpanded] = useState(false);

  // The last 8 hex chars of the observed SPKI that the user must type to confirm approval.
  // 8 chars = 1/4.3B collision probability (vs 1/65536 for 4 chars).
  const confirmSuffix = observedSpki.slice(-8).toUpperCase();
  const isConfirmValid = confirmInput.toUpperCase() === confirmSuffix;

  const handleApprove = (): void => {
    if (!isConfirmValid) return;
    setConfirmInput('');
    onApproveNewKey(observedSpki);
  };

  const handleForgetServer = (): void => {
    Alert.alert(
      'Forget this server?',
      'This will remove the server profile, all pinned keys, and the gateway token. You will need to re-add the server and re-pair your device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget server',
          style: 'destructive',
          onPress: () => {
            setConfirmInput('');
            onForgetServer();
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onReject}
    >
      <View
        style={[
          styles.root,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top + 16,
            paddingBottom: Math.max(insets.bottom + 16, 32),
          },
        ]}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Alert icon */}
          <View style={[styles.iconWrap, { backgroundColor: `${colors.destructive}15` }]}>
            <AlertTriangle size={32} color={colors.destructive} />
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>
            Certificate pin mismatch
          </Text>

          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            The gateway's certificate public key does not match any pin recorded for this server.
            This could indicate a key rotation on the server side, or a man-in-the-middle attack.
          </Text>

          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            No data was transmitted. The connection was blocked at the TLS handshake before any
            application frames were sent.
          </Text>

          {/* Hash comparison */}
          <View style={[styles.hashCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.hashLabel, { color: colors.mutedForeground }]}>OBSERVED KEY (GATEWAY)</Text>
            <Text style={[styles.hash, { color: colors.destructive }]}>{observedSpki}</Text>

            {allowedSpkis.length > 0 ? (
              <>
                <View style={[styles.hashDivider, { backgroundColor: colors.border }]} />
                <Text style={[styles.hashLabel, { color: colors.mutedForeground }]}>
                  PINNED KEY{allowedSpkis.length > 1 ? 'S' : ''} (EXPECTED)
                </Text>
                {allowedSpkis.map((h) => (
                  <Text key={h} style={[styles.hash, { color: colors.foreground }]}>{h}</Text>
                ))}
              </>
            ) : null}
          </View>

          {/* How to verify on your server */}
          <View style={[styles.verifyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable
              onPress={() => setVerifyExpanded((v) => !v)}
              style={styles.verifyHeader}
              accessibilityRole="button"
              accessibilityLabel="How to verify this on your server"
            >
              {verifyExpanded
                ? <ChevronDown size={14} color={colors.mutedForeground} />
                : <ChevronRight size={14} color={colors.mutedForeground} />}
              <Text style={[styles.verifyTitle, { color: colors.mutedForeground }]}>
                How to verify this on your server
              </Text>
            </Pressable>
            {verifyExpanded ? (
              <View style={styles.verifyBody}>
                <Text style={[styles.verifyText, { color: colors.mutedForeground }]}>
                  Run this on the server host to compute the expected SPKI hash and compare it to
                  the value shown above:
                </Text>
                <View style={[styles.codeBlock, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.codeText, { color: colors.foreground }]}>
                    {'openssl s_client -connect <hostname>:443 \\\n' +
                     '  </dev/null 2>/dev/null | \\\n' +
                     '  openssl x509 -noout -pubkey | \\\n' +
                     '  openssl pkey -pubin -outform DER | \\\n' +
                     '  openssl dgst -sha256 -hex'}
                  </Text>
                </View>
                <Text style={[styles.verifyText, { color: colors.mutedForeground }]}>
                  The hex output must exactly match the "OBSERVED KEY" shown above before you
                  approve the new key.
                </Text>
              </View>
            ) : null}
          </View>

          {/* Approve section */}
          <View style={[styles.approveCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.approveTitle, { color: colors.foreground }]}>
              Approve new key?
            </Text>
            <Text style={[styles.approveBody, { color: colors.mutedForeground }]}>
              Only approve if you initiated a key rotation on your gateway and can independently
              verify the hash above matches your server's current certificate.
            </Text>
            <Text style={[styles.approvePrompt, { color: colors.mutedForeground }]}>
              Type the last 8 characters of the key ({confirmSuffix}) to confirm:
            </Text>
            <TextInput
              value={confirmInput}
              onChangeText={setConfirmInput}
              placeholder={confirmSuffix}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
              maxLength={8}
              style={[
                styles.confirmInput,
                {
                  color: colors.foreground,
                  borderColor: isConfirmValid ? colors.success : colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            />
            <Pressable
              onPress={handleApprove}
              disabled={!isConfirmValid}
              style={({ pressed }) => [
                styles.approveBtn,
                {
                  backgroundColor: isConfirmValid ? colors.primary : `${colors.primary}40`,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              accessibilityLabel="Approve new certificate key"
              accessibilityRole="button"
            >
              <Text style={[styles.approveBtnText, { color: isConfirmValid ? colors.primaryForeground : colors.mutedForeground }]}>
                Approve new key
              </Text>
            </Pressable>
          </View>

          {/* Action buttons */}
          <View style={styles.actions}>
            <Pressable
              onPress={onReject}
              style={({ pressed }) => [
                styles.rejectBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
              accessibilityLabel="Reject and disconnect"
              accessibilityRole="button"
            >
              <Text style={[styles.rejectBtnText, { color: colors.primaryForeground }]}>
                Reject and disconnect
              </Text>
            </Pressable>

            <Pressable
              onPress={handleForgetServer}
              style={({ pressed }) => [
                styles.forgetBtn,
                { borderColor: `${colors.destructive}50`, opacity: pressed ? 0.75 : 1 },
              ]}
              accessibilityLabel="Forget this server"
              accessibilityRole="button"
            >
              <Text style={[styles.forgetBtnText, { color: colors.destructive }]}>
                Forget this server
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
    alignItems: 'stretch',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: '800',
    textAlign: 'center',
  },
  body: {
    fontSize: FontSize.sm,
    lineHeight: 22,
    textAlign: 'center',
  },
  hashCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: 6,
  },
  hashLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  hash: {
    fontSize: 10,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  hashDivider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  verifyCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  verifyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: Spacing.md,
  },
  verifyTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  verifyBody: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  verifyText: {
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  codeBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  codeText: {
    fontSize: 10,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  approveCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  approveTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  approveBody: {
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  approvePrompt: {
    fontSize: FontSize.xs,
    marginTop: 4,
  },
  confirmInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    fontSize: FontSize.md,
    fontFamily: 'monospace',
    letterSpacing: 2,
    textAlign: 'center',
  },
  approveBtn: {
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  approveBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  actions: {
    gap: Spacing.sm,
  },
  rejectBtn: {
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  rejectBtnText: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  forgetBtn: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  forgetBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
