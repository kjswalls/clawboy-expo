import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Check, ChevronDown, Copy, Key, Lock } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import { type AuthMethod } from './serverUrlHelpers';
import { addServerStyles as s } from './addServerStyles';

const TOKEN_LOOKUP_CMDS = [
  `jq -r '.gateway.auth.token' ~/.openclaw/openclaw.json`,
  `grep '^OPENCLAW_GATEWAY_TOKEN=' ~/.openclaw/.env | cut -d= -f2-`,
] as const;

interface ServerAuthSectionProps {
  authMethod: AuthMethod;
  onAuthMethodChange: (method: AuthMethod) => void;
  authValue: string;
  onAuthValueChange: (value: string) => void;
  secureAuth: boolean;
  onSecureAuthChange: (secure: boolean) => void;
  onResetTest: () => void;
  onHelpExpand: () => void;
  colors: ThemeColors;
  t: ReturnType<typeof import('react-i18next').useTranslation>['t'];
}

export function ServerAuthSection({
  authMethod,
  onAuthMethodChange,
  authValue,
  onAuthValueChange,
  secureAuth,
  onSecureAuthChange,
  onResetTest,
  onHelpExpand,
  colors,
  t,
}: ServerAuthSectionProps): React.JSX.Element {
  const [tokenHelpOpen, setTokenHelpOpen] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!tokenHelpOpen) return;
    const id = setTimeout(onHelpExpand, 80);
    return () => clearTimeout(id);
  }, [tokenHelpOpen, onHelpExpand]);

  const handleCopyCmd = useCallback(async (idx: number, cmd: string): Promise<void> => {
    await Clipboard.setStringAsync(cmd);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 2000);
  }, []);

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Method toggle */}
      <View style={s.fieldRow}>
        <Text style={[s.fieldLabel, { color: colors.foreground, marginBottom: Spacing.sm }]}>
          {t('settings.addServer.authMethod')}
        </Text>
        <View style={s.methodRow}>
          {(['token', 'password'] as AuthMethod[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => onAuthMethodChange(m)}
              style={[
                s.methodBtn,
                authMethod === m
                  ? { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}50` }
                  : { backgroundColor: colors.secondary, borderColor: 'transparent' },
              ]}
              accessibilityLabel={m === 'token' ? t('settings.addServer.authToken') : t('settings.addServer.authPassword')}
              accessibilityRole="radio"
              accessibilityState={{ checked: authMethod === m }}
            >
              {m === 'token'
                ? <Key size={14} color={authMethod === m ? colors.primary : colors.mutedForeground} />
                : <Lock size={14} color={authMethod === m ? colors.primary : colors.mutedForeground} />}
              <Text style={{
                fontSize: FontSize.sm,
                fontWeight: '500',
                color: authMethod === m ? colors.primary : colors.mutedForeground,
              }}>
                {m === 'token' ? t('settings.addServer.authToken') : t('settings.addServer.authPassword')}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[s.divider, { backgroundColor: colors.border }]} />

      {/* Auth value */}
      <View style={s.fieldRow}>
        <Text style={[s.fieldLabel, { color: colors.foreground }]}>
          {authMethod === 'token' ? t('settings.addServer.authTokenLabel') : t('settings.addServer.authPassword')}
        </Text>
        <Text style={[s.fieldHint, { color: colors.mutedForeground }]}>
          {authMethod === 'token' ? t('settings.addServer.authTokenHint') : t('settings.addServer.authPasswordHint')}
        </Text>
        <TextInput
          value={authValue}
          onChangeText={(v) => { onAuthValueChange(v); onResetTest(); }}
          placeholder={authMethod === 'token' ? t('settings.addServer.authTokenPlaceholder') : t('settings.addServer.authPasswordPlaceholder')}
          placeholderTextColor={`${colors.mutedForeground}80`}
          secureTextEntry={secureAuth}
          onFocus={() => onSecureAuthChange(false)}
          onBlur={() => onSecureAuthChange(true)}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="none"
          accessibilityLabel={authMethod === 'token' ? t('settings.addServer.authTokenLabel') : t('settings.addServer.authPassword')}
          style={[s.fieldInput, s.mono, {
            backgroundColor: colors.secondary,
            borderColor: 'transparent',
            color: colors.foreground,
          }]}
        />
      </View>

      {/* Token lookup help — shown only for token auth */}
      {authMethod === 'token' ? (
        <>
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <Pressable
            onPress={() => setTokenHelpOpen((o) => !o)}
            style={({ pressed }) => [s.tokenHelpHeader, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={t('settings.addServer.tokenHelpToggle')}
            accessibilityState={{ expanded: tokenHelpOpen }}
          >
            <Text style={[s.tokenHelpToggleText, { color: colors.mutedForeground }]}>
              {t('settings.addServer.tokenHelpToggle')}
            </Text>
            <ChevronDown
              size={14}
              color={colors.mutedForeground}
              style={{ transform: [{ rotate: tokenHelpOpen ? '180deg' : '0deg' }] }}
            />
          </Pressable>
          {tokenHelpOpen ? (
            <View style={[s.tokenHelpBody, { backgroundColor: colors.secondary }]}>
              <Text style={[s.tokenHelpIntro, { color: colors.mutedForeground }]}>
                {t('settings.addServer.tokenHelpIntro')}
              </Text>
              {([
                { label: 'settings.addServer.tokenHelpLegacyLabel', idx: 0 },
                { label: 'settings.addServer.tokenHelpDotenvLabel', idx: 1 },
              ] as const).map(({ label, idx }) => (
                <View key={idx} style={s.tokenCmdBlock}>
                  <Text style={[s.tokenCmdLabel, { color: colors.mutedForeground }]}>
                    {t(label)}
                  </Text>
                  <View style={[s.tokenCmdRow, { borderColor: `${colors.border}` }]}>
                    <Text style={[s.mono, s.tokenCmdText, { color: colors.foreground }]} selectable>
                      {TOKEN_LOOKUP_CMDS[idx]}
                    </Text>
                    <Pressable
                      onPress={() => { void handleCopyCmd(idx, TOKEN_LOOKUP_CMDS[idx]); }}
                      style={({ pressed }) => [
                        s.tokenCopyBtn,
                        { borderColor: `${colors.foreground}30` },
                        pressed && { opacity: 0.6 },
                      ]}
                      accessibilityLabel={t('common.copy')}
                      accessibilityRole="button"
                    >
                      {copiedIdx === idx
                        ? <Check size={11} color={colors.success} />
                        : <Copy size={11} color={colors.mutedForeground} />}
                      <Text style={[s.tokenCopyBtnText, {
                        color: copiedIdx === idx ? colors.success : colors.mutedForeground,
                      }]}>
                        {copiedIdx === idx ? t('common.copied') : t('common.copy')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
