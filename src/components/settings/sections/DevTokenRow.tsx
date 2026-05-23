import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BorderRadius, FontSize, FontWeight } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import {
  clearDevBypassToken,
  DEV_BYPASS_TOKEN_MIN_LENGTH,
  setDevBypassToken,
  type DevBypassTokenStatus,
} from '@/lib/feedback/devBypassToken';
import { translateClawError } from '@/utils/translateError';

function Divider({ color }: { color: string }): React.JSX.Element {
  return <View style={[tokenStyles.divider, { backgroundColor: color }]} />;
}

export function DevTokenRow({
  colors,
  tokenStatus,
  onStatusChange,
}: {
  colors: ThemeColors;
  tokenStatus: DevBypassTokenStatus;
  onStatusChange: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    setError(null);
    const trimmed = input.trim();
    if (trimmed.length < DEV_BYPASS_TOKEN_MIN_LENGTH) {
      setError(t('settings.developer.token.errorTooShort'));
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
      t('settings.developer.token.clear'),
      t('settings.developer.token.statusNotSet'),
      [
        { text: t('feedback.discardBtn'), style: 'destructive', onPress: () => {
          void clearDevBypassToken().then(onStatusChange);
        }},
        { text: t('feedback.keepEditing'), style: 'cancel' },
      ],
    );
  }, [onStatusChange, t]);

  return (
    <View>
      {/* Status */}
      <View style={tokenStyles.statusRow}>
        <Text style={[tokenStyles.statusLabel, { color: colors.mutedForeground }]}>
          {tokenStatus.set
            ? t('settings.developer.token.statusSet')
            : t('settings.developer.token.statusNotSet')}
        </Text>
        {tokenStatus.preview != null && (
          <Text style={[tokenStyles.statusValue, tokenStyles.mono, { color: colors.foreground }]}>
            {tokenStatus.preview}
          </Text>
        )}
      </View>

      <Divider color={colors.border} />

      {/* Input + Save */}
      <View style={tokenStyles.inputRow}>
        <TextInput
          style={[tokenStyles.input, { color: colors.foreground, borderColor: error ? colors.destructive : colors.border, backgroundColor: colors.background }]}
          placeholder={t('settings.developer.token.placeholder')}
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
            tokenStyles.saveBtn,
            { borderColor: `${colors.foreground}30`, opacity: pressed || saving || input.trim().length === 0 ? 0.5 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('settings.developer.token.save')}
        >
          {saving
            ? <ActivityIndicator size="small" color={colors.foreground} />
            : <Text style={[tokenStyles.saveBtnText, { color: colors.foreground }]}>{t('settings.developer.token.save')}</Text>}
        </Pressable>
      </View>

      {error != null && (
        <Text style={[tokenStyles.errorText, { color: colors.destructive }]}>{error}</Text>
      )}

      {/* Clear */}
      {tokenStatus.set && (
        <>
          <Divider color={colors.border} />
          <Pressable
            onPress={handleClear}
            style={({ pressed }) => [tokenStyles.clearRow, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={t('settings.developer.token.clear')}
          >
            <Text style={[tokenStyles.clearLabel, { color: colors.destructive }]}>
              {t('settings.developer.token.clear')}
            </Text>
          </Pressable>
        </>
      )}

      <Divider color={colors.border} />

      {/* Footer note */}
      <Text style={[tokenStyles.footerNote, { color: colors.mutedForeground }]}>
        {t('settings.developer.token.footerNote')}
      </Text>
    </View>
  );
}

const tokenStyles = StyleSheet.create({
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusLabel: { fontSize: FontSize.sm, flex: 1 },
  statusValue: { fontSize: FontSize.sm },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    height: 30,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 10,
    fontSize: FontSize.xs,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  saveBtn: {
    height: 30,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  errorText: {
    fontSize: FontSize.xs,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  clearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  clearLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  footerNote: {
    fontSize: FontSize.xs,
    lineHeight: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
