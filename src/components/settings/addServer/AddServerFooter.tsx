import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { AlertCircle, Check, ChevronRight, Loader2, Trash2 } from 'lucide-react-native';
import Animated from 'react-native-reanimated';
import type { AnimatedStyle } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';
import Markdown from '@ronradtke/react-native-markdown-display';
import { FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import { createBannerMarkdownStyles } from '@/utils/markdownTheme';
import { addServerStyles as s } from './addServerStyles';

interface AddServerFooterProps {
  isTestOnly: boolean;
  isConnecting: boolean;
  testPassed: boolean;
  needsPairing: boolean;
  displayError: string | null;
  isEditMode: boolean;
  isDirty: boolean;
  hasFieldErrors: boolean;
  canConnect: boolean;
  bottomInset: number;
  onDeleteProfile: () => void;
  onTestOnly: () => void;
  onConnect: () => void;
  spinStyle: AnimatedStyle<ViewStyle>;
  colors: ThemeColors;
  t: ReturnType<typeof import('react-i18next').useTranslation>['t'];
}

export function AddServerFooter({
  isTestOnly,
  isConnecting,
  testPassed,
  needsPairing,
  displayError,
  isEditMode,
  isDirty,
  hasFieldErrors,
  canConnect,
  bottomInset,
  onDeleteProfile,
  onTestOnly,
  onConnect,
  spinStyle,
  colors,
  t,
}: AddServerFooterProps): React.JSX.Element {
  const btnBg = hasFieldErrors
    ? `${colors.destructive}18`
    : !canConnect
      ? colors.muted
      : colors.secondary;
  const btnBorderColor = hasFieldErrors
    ? colors.destructive
    : isDirty
      ? colors.foreground
      : colors.border;
  const btnText = hasFieldErrors
    ? colors.destructive
    : canConnect
      ? colors.foreground
      : colors.mutedForeground;

  return (
    <View style={[
      s.footer,
      {
        borderTopColor: colors.border,
        backgroundColor: `${colors.card}E8`,
        paddingBottom: Math.max(bottomInset, Spacing.md) + Spacing.sm,
      },
    ]}>
      {testPassed ? (
        <View style={[s.footerError, { backgroundColor: `${colors.success}10`, borderColor: `${colors.success}30` }]}>
          <Check size={15} color={colors.success} style={{ flexShrink: 0, marginTop: 1 }} />
          <View style={s.flex}>
            <Text style={{ color: colors.success, fontSize: FontSize.xs, fontWeight: '600' }}>
              {t('settings.addServer.testPassedTitle')}
            </Text>
            <Text style={{ color: `${colors.success}BB`, fontSize: FontSize.xs, lineHeight: 16, marginTop: 1 }}>
              {needsPairing
                ? t('settings.addServer.testPassedPairing')
                : t('settings.addServer.testPassedConnected')}
            </Text>
          </View>
        </View>
      ) : null}

      {displayError ? (
        <View style={[s.footerError, { backgroundColor: `${colors.destructive}10`, borderColor: `${colors.destructive}28` }]}>
          <AlertCircle size={15} color={colors.destructive} style={{ flexShrink: 0, marginTop: 1 }} />
          <View style={s.flex}>
            <Text style={{ color: colors.destructive, fontSize: FontSize.xs, fontWeight: '600' }}>
              {t('settings.addServer.connectionFailed')}
            </Text>
            <Markdown style={createBannerMarkdownStyles(`${colors.destructive}BB`, FontSize.xs)}>
              {displayError}
            </Markdown>
          </View>
        </View>
      ) : null}

      <View style={s.footerBtnRow}>
        {isEditMode ? (
          <Pressable
            onPress={onDeleteProfile}
            style={({ pressed }) => [s.trashBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel={t('settings.addServer.deleteProfileLabel')}
            accessibilityRole="button"
          >
            <Trash2 size={16} color={colors.destructive} />
          </Pressable>
        ) : null}
        <View style={s.footerBtnGroup}>
          <Pressable
            onPress={onTestOnly}
            disabled={isConnecting}
            style={({ pressed }) => [
              s.connectBtn,
              s.testBtn,
              { borderColor: colors.border },
              pressed && { opacity: 0.82 },
            ]}
            accessibilityLabel={isConnecting && isTestOnly ? t('settings.addServer.btnTesting') : t('settings.addServer.btnTest')}
            accessibilityRole="button"
          >
            {isConnecting && isTestOnly ? (
              <Animated.View style={spinStyle}>
                <Loader2 size={14} color={colors.mutedForeground} />
              </Animated.View>
            ) : null}
            <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, fontWeight: '500' }}>
              {isConnecting && isTestOnly ? t('settings.addServer.btnTesting') : t('settings.addServer.btnTest')}
            </Text>
          </Pressable>
          <Pressable
            onPress={onConnect}
            disabled={isConnecting}
            style={({ pressed }) => [
              s.connectBtn,
              { backgroundColor: btnBg, borderColor: btnBorderColor },
              pressed && { opacity: 0.82 },
            ]}
            accessibilityLabel={
              isConnecting && !isTestOnly
                ? t('settings.addServer.btnTesting')
                : isEditMode
                  ? t('settings.addServer.btnSave')
                  : t('settings.addServer.btnConnect')
            }
            accessibilityRole="button"
          >
            {isConnecting && !isTestOnly ? (
              <Animated.View style={spinStyle}>
                <Loader2 size={14} color={colors.mutedForeground} />
              </Animated.View>
            ) : null}
            <Text style={{ color: btnText, fontSize: FontSize.xs, fontWeight: '500' }}>
              {isConnecting && !isTestOnly
                ? t('settings.addServer.btnTesting')
                : isEditMode
                  ? t('settings.addServer.btnSave')
                  : t('settings.addServer.btnConnect')}
            </Text>
            {!(isConnecting && !isTestOnly) ? <ChevronRight size={13} color={btnText} /> : null}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
