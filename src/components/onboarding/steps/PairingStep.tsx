import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { BrandLoader } from '@/components/common/BrandLoader';
import { CodeBlock } from '@/components/chat/CodeBlock';
import { PairingInfoRow } from '../components/PairingInfoRow';
import { formatDeviceFingerprint } from '@/lib/device-identity';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors, ServerProfile } from '@/types';

export interface PairingStepProps {
  colors: ThemeColors;
  gatewayHost: string | null;
  isInsecureScheme: boolean;
  deviceId: string | null;
  activeProfile: ServerProfile | null;
  onTryAgain: () => void;
  onPinCert: (spki: string, current: string[]) => void;
}

export function PairingStep({
  colors,
  gatewayHost,
  isInsecureScheme,
  deviceId,
  activeProfile,
  onTryAgain,
  onPinCert,
}: PairingStepProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.centerContent}>
      <Text style={[styles.h1, { color: colors.foreground, textAlign: 'center' }]}>
        {t('onboarding.pairing.title')}
      </Text>
      <Text style={[styles.p, { color: colors.mutedForeground, textAlign: 'center' }]}>
        {t('onboarding.pairing.body')}
      </Text>

      {/* Approve + waiting — unified card */}
      <View style={[styles.approveCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.approveCaption, { color: colors.mutedForeground }]}>
          {t('onboarding.pairing.approveOnServer')}
        </Text>
        <CodeBlock
          code={'openclaw devices approve\nopenclaw devices approve <requestId>'}
          language="bash"
          fontSize={FontSize.xs}
        />
        <View style={styles.waitingRow}>
          <BrandLoader variant="small" />
          <Text style={[styles.waitingText, { color: colors.mutedForeground }]}>
            {t('onboarding.pairing.waiting')}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onTryAgain}
        style={({ pressed }) => [
          styles.secondaryBtn,
          { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.pairing.tryAgain')}
      >
        <Text style={{ color: colors.mutedForeground, fontSize: FontSize.sm, fontWeight: '500' }}>
          {t('onboarding.pairing.tryAgain')}
        </Text>
      </Pressable>

      {(gatewayHost || deviceId) ? (
        <View style={[styles.verifyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.verifyHeading, { color: colors.mutedForeground }]}>
            {t('onboarding.pairing.verifyHeading')}
          </Text>
          {gatewayHost ? (
            <PairingInfoRow label={t('onboarding.pairing.labelGateway')} value={gatewayHost} colors={colors} />
          ) : null}
          {gatewayHost ? (
            <PairingInfoRow
              label={t('onboarding.pairing.labelSecurity')}
              value={isInsecureScheme ? t('onboarding.pairing.securityInsecure') : t('onboarding.pairing.securitySecure')}
              valueColor={isInsecureScheme ? colors.destructive : colors.success}
              colors={colors}
            />
          ) : null}
          {deviceId ? (
            <PairingInfoRow
              label={t('onboarding.pairing.labelDeviceKey')}
              value={formatDeviceFingerprint(deviceId)}
              mono
              hint={t('onboarding.pairing.deviceKeyHint')}
              colors={colors}
            />
          ) : null}
          {activeProfile?.security?.firstSeenSpkiSha256 ? (
            <PairingInfoRow
              label={t('onboarding.pairing.labelGatewayCert')}
              value={activeProfile.security.firstSeenSpkiSha256}
              mono
              hint={t('onboarding.pairing.gatewayCertHint')}
              colors={colors}
            />
          ) : (
            <PairingInfoRow
              label={t('onboarding.pairing.labelCertPin')}
              value={t('onboarding.pairing.certPinAvailable')}
              muted
              colors={colors}
            />
          )}
        </View>
      ) : null}

      {activeProfile?.security?.firstSeenSpkiSha256 &&
        !activeProfile.security.pinnedSpkiSha256?.length ? (
        <View style={styles.certPinHint}>
          <Text style={[styles.certPinHintText, { color: colors.mutedForeground }]}>
            {t('onboarding.pairing.certPinHint')}
          </Text>
          <Pressable
            onPress={() => {
              const spki = activeProfile!.security!.firstSeenSpkiSha256!;
              const current = activeProfile!.security?.pinnedSpkiSha256 ?? [];
              onPinCert(spki, current);
            }}
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            accessibilityLabel={t('onboarding.pairing.pinNowLabel')}
            accessibilityRole="button"
          >
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, textDecorationLine: 'underline' }}>
              {t('onboarding.pairing.pinNow')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  centerContent: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  h1: {
    fontSize: FontSize['2xl'],
    fontWeight: '700',
    lineHeight: 32,
    marginBottom: Spacing.sm,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  p: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
    marginTop: Spacing.md,
  },
  secondaryBtn: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  approveCard: {
    width: '100%',
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  approveCaption: {
    fontSize: FontSize.xs,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  waitingText: {
    fontSize: FontSize.xs,
  },
  certPinHint: {
    marginTop: Spacing.md,
    width: '100%',
    alignItems: 'center',
    gap: 4,
  },
  certPinHintText: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  verifyCard: {
    width: '100%',
    marginTop: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    gap: 4,
  },
  verifyHeading: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
});
