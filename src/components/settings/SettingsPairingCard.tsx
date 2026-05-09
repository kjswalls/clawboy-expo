import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BrandLoader } from '@/components/common/BrandLoader';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ShieldAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useThemeContext } from '@/contexts/ThemeContext';
import { CodeBlock } from '@/components/chat/CodeBlock';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

interface SettingsPairingCardProps {
  /** Called when the user taps "Try again". */
  onRetry?: () => void;
}

export function SettingsPairingCard({ onRetry }: SettingsPairingCardProps): React.JSX.Element {
  const { colors } = useThemeContext();
  const { t } = useTranslation();

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      {/* Warning header strip */}
      <View style={[styles.headerStrip, { backgroundColor: `${colors.warning}14`, borderBottomColor: colors.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: `${colors.warning}22` }]}>
          <ShieldAlert size={20} color={colors.warningText} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {t('settings.pairing.needsApprovalTitle')}
          </Text>
          <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
            {t('settings.pairing.needsApprovalBody')}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        {/* CLI commands */}
        <View style={styles.approveBlock}>
          <Text style={[styles.approveCaption, { color: colors.mutedForeground }]}>
            {t('onboarding.pairing.approveOnServer')}
          </Text>
          <CodeBlock
            code={'openclaw devices list\nopenclaw devices approve <requestId>'}
            language="bash"
            fontSize={FontSize.xs}
          />
        </View>

        {/* Waiting indicator + try again */}
        <View style={styles.footerRow}>
          <View style={styles.waitingRow}>
            <BrandLoader variant="small" />
            <Text style={[styles.waitingText, { color: colors.mutedForeground }]}>
              {t('onboarding.pairing.waiting')}
            </Text>
          </View>

          {onRetry ? (
            <Pressable
              onPress={onRetry}
              style={({ pressed }) => [
                styles.retryBtn,
                { borderColor: `${colors.foreground}25` },
                pressed && styles.btnPressed,
              ]}
              accessibilityLabel={t('onboarding.pairing.tryAgain')}
              accessibilityRole="button"
            >
              <Text style={[styles.retryBtnText, { color: colors.foreground }]}>
                {t('onboarding.pairing.tryAgain')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  headerStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
    gap: 3,
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  bodyText: {
    fontSize: FontSize.xs,
    lineHeight: 17,
  },
  body: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  approveBlock: {
    gap: 4,
  },
  approveCaption: {
    fontSize: FontSize.xs,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  waitingText: {
    fontSize: FontSize.xs,
  },
  retryBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  retryBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  btnPressed: { opacity: 0.75 },
});
