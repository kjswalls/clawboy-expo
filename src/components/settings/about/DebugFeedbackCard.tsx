import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BorderRadius, Colors, FontSize, FontWeight } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import {
  clearDevBypassToken,
  DEV_BYPASS_TOKEN_MIN_LENGTH,
  setDevBypassToken,
  type DevBypassTokenStatus,
} from '@/lib/feedback/devBypassToken';
import { translateClawError } from '@/utils/translateError';
import { Divider, styles } from './aboutStyles';

export function DebugFeedbackCard({
  colors,
  bypassStatus,
  onStatusChange,
  onHide,
}: {
  colors: ThemeColors;
  bypassStatus: DevBypassTokenStatus;
  onStatusChange: () => void;
  onHide: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    setError(null);
    const trimmed = input.trim();
    if (trimmed.length < DEV_BYPASS_TOKEN_MIN_LENGTH) {
      setError(t('about.debug.feedbackBypass.errorTooShort'));
      return;
    }
    setSaving(true);
    try {
      await setDevBypassToken(trimmed);
      setInput('');
      onStatusChange();
    } catch (err) {
      setError(translateClawError(err));
    } finally {
      setSaving(false);
    }
  }, [input, onStatusChange, t]);

  const handleClear = useCallback(() => {
    Alert.alert(
      t('about.debug.feedbackBypass.clear'),
      t('about.debug.feedbackBypass.statusNotSet'),
      [
        { text: t('feedback.discardBtn'), style: 'destructive', onPress: () => {
          void clearDevBypassToken().then(onStatusChange);
        }},
        { text: t('feedback.keepEditing'), style: 'cancel' },
      ],
    );
  }, [onStatusChange, t]);

  return (
    <View style={[styles.card, debugStyles.card, { backgroundColor: colors.card, borderColor: colors.warning }]}>
      {/* Header row */}
      <View style={[styles.row, debugStyles.headerRow]}>
        <Text style={[debugStyles.title, { color: colors.warning }]}>
          {t('about.debug.feedbackBypass.title')}
        </Text>
        <Pressable
          onPress={onHide}
          style={({ pressed }) => [debugStyles.hideBtn, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={t('about.debug.feedbackBypass.hide')}
        >
          <Text style={[debugStyles.hideBtnText, { color: colors.mutedForeground }]}>
            {t('about.debug.feedbackBypass.hide')}
          </Text>
        </Pressable>
      </View>

      <Divider color={colors.border} />

      {/* Status */}
      <View style={[styles.row, { paddingVertical: 8 }]}>
        <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>
          {bypassStatus.set
            ? t('about.debug.feedbackBypass.statusSet')
            : t('about.debug.feedbackBypass.statusNotSet')}
        </Text>
        {bypassStatus.preview != null && (
          <Text style={[styles.metaValue, styles.metaMono, { color: colors.foreground }]}>
            {bypassStatus.preview}
          </Text>
        )}
      </View>

      <Divider color={colors.border} />

      {/* Input + Save */}
      <View style={debugStyles.inputRow}>
        <TextInput
          style={[debugStyles.input, { color: colors.foreground, borderColor: error ? colors.destructive : colors.border, backgroundColor: colors.background }]}
          placeholder={t('about.debug.feedbackBypass.placeholder')}
          placeholderTextColor={colors.mutedForeground}
          value={input}
          onChangeText={(v) => { setInput(v); setError(null); }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
        />
        <Pressable
          onPress={() => { void handleSave(); }}
          disabled={saving || input.trim().length === 0}
          style={({ pressed }) => [
            debugStyles.saveBtn,
            { backgroundColor: colors.primary, opacity: pressed || saving || input.trim().length === 0 ? 0.5 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('about.debug.feedbackBypass.save')}
        >
          {saving
            ? <ActivityIndicator size="small" color={colors.primaryForeground} />
            : <Text style={debugStyles.saveBtnText}>{t('about.debug.feedbackBypass.save')}</Text>}
        </Pressable>
      </View>

      {error != null && (
        <Text style={[debugStyles.errorText, { color: colors.destructive }]}>{error}</Text>
      )}

      {/* Clear */}
      {bypassStatus.set && (
        <>
          <Divider color={colors.border} />
          <Pressable
            onPress={handleClear}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={t('about.debug.feedbackBypass.clear')}
          >
            <Text style={[styles.rowLabel, { color: colors.destructive }]}>
              {t('about.debug.feedbackBypass.clear')}
            </Text>
          </Pressable>
        </>
      )}

      <Divider color={colors.border} />

      {/* Footer note */}
      <Text style={[debugStyles.footerNote, { color: colors.mutedForeground }]}>
        {t('about.debug.feedbackBypass.footerNote')}
      </Text>
    </View>
  );
}

const debugStyles = StyleSheet.create({
  card: {
    marginTop: 16,
    borderWidth: 1,
  },
  headerRow: {
    justifyContent: 'space-between',
  },
  title: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.4,
    flex: 1,
  },
  hideBtn: {
    paddingVertical: 2,
    paddingLeft: 12,
  },
  hideBtnText: {
    fontSize: FontSize.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    height: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 10,
    fontSize: FontSize.sm,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  saveBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: Colors.dark.primaryForeground,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  errorText: {
    fontSize: FontSize.xs,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  footerNote: {
    fontSize: FontSize.xs,
    lineHeight: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
