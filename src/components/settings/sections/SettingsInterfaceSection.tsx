import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight, ShieldAlert, Sparkles } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTokens } from '@/hooks/useTokens';
import type { ThemeColors } from '@/types';
import { CompactSettingsSwitch } from '../CompactSettingsSwitch';
import { useCommandConfirmations } from '@/hooks/useCommandConfirmations';
import { useConventionInstall } from '@/contexts/ConventionInstallContext';
import { createPanelStyles } from './panelStyles';

type InterfaceProps = {
  colors: ThemeColors;
};

export function SettingsInterfaceSection({ colors }: InterfaceProps): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();
  const tk = useTokens();
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const styles = useMemo(() => createPanelStyles(tk), [tk]);
  const { confirmDestructiveCommands, setConfirmDestructiveCommands } = useCommandConfirmations();
  const { globalMode } = useConventionInstall();

  const conventionsSubtitle = globalMode === 'auto'
    ? t('settings.nav.conventions.subtitleAuto')
    : globalMode === 'off'
      ? t('settings.nav.conventions.subtitleOff')
      : t('settings.nav.conventions.subtitlePrimer');

  return (
    <View style={{ marginBottom: tk.sp.xl }}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{t('settings.interface.title')}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable
          onPress={() => setConfirmDestructiveCommands(!confirmDestructiveCommands)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          accessibilityRole="switch"
          accessibilityValue={{ text: confirmDestructiveCommands ? 'on' : 'off' }}
          accessibilityLabel={t('settings.general.confirmCommands.row')}
        >
          <ShieldAlert size={tk.iconSm} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
              {t('settings.general.confirmCommands.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
              {t('settings.general.confirmCommands.subtitle')}
            </Text>
          </View>
          <CompactSettingsSwitch value={confirmDestructiveCommands} />
        </Pressable>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Pressable
          onPress={() => router.push('/settings/conventions')}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel={t('settings.nav.conventions.row')}
        >
          <Sparkles size={tk.iconSm} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
              {t('settings.nav.conventions.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
              {conventionsSubtitle}
            </Text>
          </View>
          <ChevronRight size={tk.iconSm} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}
