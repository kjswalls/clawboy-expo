import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { AlertTriangle, ShieldAlert } from 'lucide-react-native';
import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';

interface PairingRequiredCardProps {
  onOpenSettings: () => void;
  /** Full formatted device fingerprint (4-char grouped SHA-256 hex). */
  deviceFingerprint?: string | null;
  /** Deprecated: 8-char prefix shown when fingerprint is unavailable. */
  deviceIdPrefix?: string;
  /** Hostname (and optional port) of the active gateway. */
  gatewayHost?: string | null;
  /** True when the connection uses ws:// instead of wss://. */
  isInsecureScheme?: boolean;
  /** First-seen gateway certificate SPKI SHA-256 hex (from TOFU recording). */
  gatewayCertSpki?: string | null;
  /** Called when the user taps "Trust this certificate key". */
  onTrustCert?: () => void;
}

interface VerifyRowProps {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
  valueColor?: string;
  colors: ThemeColors;
}

function VerifyRow({ label, value, mono, muted, valueColor, colors }: VerifyRowProps): React.JSX.Element {
  const textColor = valueColor ?? (muted ? colors.mutedForeground : colors.foreground);
  return (
    <View style={vrStyles.row}>
      <Text style={[vrStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text
        style={[vrStyles.value, { color: textColor }, mono ? vrStyles.mono : undefined]}
        numberOfLines={mono ? 2 : 1}
        ellipsizeMode="middle"
      >
        {value}
      </Text>
    </View>
  );
}

const vrStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, paddingVertical: 2 },
  label: { fontSize: FontSize.xs, fontWeight: '500', flexShrink: 0 },
  value: { fontSize: FontSize.xs, flex: 1, textAlign: 'right' },
  mono: { fontFamily: 'monospace', fontSize: 10 },
});

export function PairingRequiredCard({
  onOpenSettings,
  deviceFingerprint,
  deviceIdPrefix,
  gatewayHost,
  isInsecureScheme,
  gatewayCertSpki,
  onTrustCert,
}: PairingRequiredCardProps): React.JSX.Element {
  const { colors } = useThemeContext();

  const hasVerifyInfo = !!(gatewayHost || deviceFingerprint);

  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      style={[styles.card, { backgroundColor: `${colors.warning}18`, borderColor: `${colors.warning}40` }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${colors.warning}26` }]}>
        <ShieldAlert size={22} color={colors.warningText} />
      </View>

      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Device approval needed
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          This device needs to be approved on your OpenClaw server before you can chat.
          {!hasVerifyInfo && deviceIdPrefix ? `\n\nDevice ID: ${deviceIdPrefix}…` : ''}
        </Text>
      </View>

      {hasVerifyInfo ? (
        <View style={[styles.verifyBlock, { borderTopColor: `${colors.warning}30` }]}>
          <Text style={[styles.verifyHeading, { color: colors.mutedForeground }]}>
            VERIFY ON YOUR GATEWAY
          </Text>
          {gatewayHost ? (
            <VerifyRow label="Gateway" value={gatewayHost} colors={colors} />
          ) : null}
          {gatewayHost ? (
            <VerifyRow
              label="Security"
              value={isInsecureScheme ? 'ws:// — unencrypted' : 'wss:// — encrypted'}
              valueColor={isInsecureScheme ? colors.destructive : colors.success}
              colors={colors}
            />
          ) : null}
          {deviceFingerprint ? (
            <VerifyRow label="Device key" value={deviceFingerprint} mono colors={colors} />
          ) : null}
          {gatewayCertSpki ? (
            <VerifyRow label="Gateway cert" value={gatewayCertSpki} mono colors={colors} />
          ) : (
            <VerifyRow label="Cert pin" value="Available after pinning enabled" muted colors={colors} />
          )}
        </View>
      ) : null}

      {gatewayCertSpki && onTrustCert ? (
        <Pressable
          onPress={onTrustCert}
          style={({ pressed }) => [
            styles.trustBtn,
            { borderColor: `${colors.success}60`, backgroundColor: `${colors.success}10` },
            pressed && styles.btnPressed,
          ]}
          accessibilityLabel="Trust and pin this gateway certificate key"
          accessibilityRole="button"
        >
          <Text style={[styles.trustBtnText, { color: colors.success }]}>
            Trust this certificate key
          </Text>
        </Pressable>
      ) : null}

      {isInsecureScheme ? (
        <View style={[styles.insecureWarning, { backgroundColor: `${colors.destructive}15`, borderColor: `${colors.destructive}40` }]}>
          <AlertTriangle size={11} color={colors.destructive} />
          <Text style={[styles.insecureText, { color: colors.destructive }]}>
            Unencrypted connection. Update to wss:// in Settings.
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={onOpenSettings}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: colors.warningText },
          pressed && styles.btnPressed,
        ]}
        accessibilityLabel="Open Settings to approve device"
        accessibilityRole="button"
      >
        <Text style={styles.btnText}>Open Settings</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    gap: 4,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  body: {
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  verifyBlock: {
    width: '100%',
    borderTopWidth: 1,
    paddingTop: Spacing.sm,
    gap: 4,
  },
  verifyHeading: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  insecureWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    width: '100%',
  },
  insecureText: {
    fontSize: FontSize.xs,
    flex: 1,
    lineHeight: 16,
  },
  trustBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  trustBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  btn: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.md,
  },
  btnPressed: { opacity: 0.8 },
  btnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: '#fff',
  },
});
